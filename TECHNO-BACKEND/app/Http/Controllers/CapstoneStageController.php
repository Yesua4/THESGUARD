<?php
namespace App\Http\Controllers;

use App\Models\CapstoneStage;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// The school's capstone plan (which year level + term each stage is in).
// Everyone in the school can read it; only the admin can change it.
class CapstoneStageController extends Controller {

    public function index(Request $request) {
        return response()->json(
            CapstoneStage::where('school_id', $request->user()->school_id)->orderBy('year_level')->orderBy('term_no')->get()
        );
    }

    public function store(Request $request) {
        $user = $this->admin($request);
        $stage = CapstoneStage::create($this->validated($request, $user->school_id) + ['school_id' => $user->school_id]);
        return response()->json($stage, 201);
    }

    public function update(Request $request, $id) {
        $user = $this->admin($request);
        $stage = CapstoneStage::where('school_id', $user->school_id)->findOrFail($id);
        $stage->update($this->validated($request, $user->school_id, $stage->id));
        return response()->json($stage);
    }

    public function destroy(Request $request, $id) {
        $user = $this->admin($request);
        CapstoneStage::where('school_id', $user->school_id)->findOrFail($id)->delete();
        return response()->json(['message' => 'Deleted']);
    }

    private function admin(Request $request) {
        $user = $request->user();
        abort_unless($user->role === 'admin' && $user->school_id, 403, 'Only the administrator can set the capstone plan.');
        return $user;
    }

    private function validated(Request $request, int $schoolId, ?int $ignoreId = null): array {
        return $request->validate([
            'name'       => ['required', 'string', 'max:50', Rule::unique('capstone_stages')->where('school_id', $schoolId)->ignore($ignoreId)],
            'year_level' => 'required|integer|min:1|max:6',
            'term_no'    => ['required', 'integer', 'min:1', 'max:4',
                Rule::unique('capstone_stages')->where('school_id', $schoolId)->where('year_level', $request->input('year_level'))->ignore($ignoreId)],
        ], [
            'name.unique'    => 'There is already a stage with this name.',
            'term_no.unique' => 'Another stage already uses this year level and term.',
        ]);
    }
}
