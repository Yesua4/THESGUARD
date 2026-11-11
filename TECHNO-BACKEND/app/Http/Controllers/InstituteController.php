<?php
namespace App\Http\Controllers;

use App\Models\Institute;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// The school admin (the admin with no institute) sets up the institutes and
// whether each does capstone or thesis. Everyone in the school can read them.
class InstituteController extends Controller {

    private function assertSchoolAdmin(Request $request) {
        abort_unless($request->user()->isSchoolAdmin(), 403, 'Only the school administrator can manage institutes.');
    }

    public function index(Request $request) {
        $schoolId = $request->user()->school_id;
        return response()->json(
            Institute::where('school_id', $schoolId)->withCount(['users', 'groups'])->orderBy('name')->get()
        );
    }

    private function rules(Request $request, ?Institute $existing = null): array {
        return [
            'name'          => ['required', 'string', 'max:150',
                Rule::unique('institutes', 'name')->where('school_id', $request->user()->school_id)->ignore($existing?->id)],
            'research_type' => 'required|in:' . implode(',', Institute::TYPES),
        ];
    }

    public function store(Request $request) {
        $this->assertSchoolAdmin($request);
        $data = $request->validate($this->rules($request), ['name.unique' => 'This school already has an institute with that name.']);
        $institute = Institute::create($data + ['school_id' => $request->user()->school_id]);
        $this->live($request);
        return response()->json($institute, 201);
    }

    public function update(Request $request, $id) {
        $this->assertSchoolAdmin($request);
        $institute = Institute::where('school_id', $request->user()->school_id)->findOrFail($id);
        $institute->update($request->validate($this->rules($request, $institute), ['name.unique' => 'This school already has an institute with that name.']));
        $this->live($request);
        return response()->json($institute);
    }

    // People and groups in it are kept; they just have no institute afterwards.
    public function destroy(Request $request, $id) {
        $this->assertSchoolAdmin($request);
        Institute::where('school_id', $request->user()->school_id)->findOrFail($id)->delete();
        $this->live($request);
        return response()->json(['message' => 'Institute removed.']);
    }

    private function live(Request $request): void {
        try {
            app(\App\Services\LiveUpdateService::class)->directory($request->user()->school_id, 'institutes_updated');
        } catch (\Throwable $e) { /* live updates are best-effort */ }
    }
}
