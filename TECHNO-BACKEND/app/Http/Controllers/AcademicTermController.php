<?php
namespace App\Http\Controllers;

use App\Models\AcademicTerm;
use Illuminate\Http\Request;

// The school's academic calendar. Everyone in the school can read it (forms
// pre-select the current term); only the admin can change it.
class AcademicTermController extends Controller {

    public function index(Request $request) {
        $user = $request->user();
        $terms = AcademicTerm::where('school_id', $user->school_id)
            ->orderBy('start_date')
            ->get();
        $current = AcademicTerm::currentFor($user->school_id);

        return response()->json([
            'terms'           => $terms,
            'current_term_id' => $current?->id,
            'today'           => AcademicTerm::today(),
        ]);
    }

    public function store(Request $request) {
        $user = $request->user();
        $this->assertAdmin($user);
        $data = $this->validated($request, $user->school_id);

        $term = AcademicTerm::create($data + ['school_id' => $user->school_id]);
        return response()->json($term, 201);
    }

    public function update(Request $request, $id) {
        $user = $request->user();
        $this->assertAdmin($user);
        $term = AcademicTerm::where('school_id', $user->school_id)->findOrFail($id);

        $term->update($this->validated($request, $user->school_id, $term->id));
        return response()->json($term);
    }

    // Groups keep their batch (academic year) text; only the term link is
    // cleared (nullOnDelete).
    public function destroy(Request $request, $id) {
        $user = $request->user();
        $this->assertAdmin($user);
        AcademicTerm::where('school_id', $user->school_id)->findOrFail($id)->delete();
        return response()->json(['message' => 'Deleted']);
    }

    private function assertAdmin($user): void {
        abort_unless($user->role === 'admin', 403, 'Only the administrator can set the academic calendar.');
        abort_unless($user->school_id, 403, 'Your account is not attached to a school.');
    }

    private function validated(Request $request, int $schoolId, ?int $ignoreId = null): array {
        $request->merge([
            'academic_year' => preg_replace('/\s*[-–—]\s*/u', '-', trim((string) $request->input('academic_year'))),
            'name'          => preg_replace('/\s+/', ' ', trim((string) $request->input('name'))),
        ]);
        $data = $request->validate([
            'academic_year' => ['required', 'string', 'max:20', 'regex:/^\d{4}-\d{4}$/'],
            'name'          => 'required|string|max:50',
            'start_date'    => 'required|date',
            'end_date'      => 'required|date|after_or_equal:start_date',
        ], [
            'academic_year.regex' => 'Use the format 2026-2027.',
        ]);

        $duplicate = AcademicTerm::where('school_id', $schoolId)
            ->where('academic_year', $data['academic_year'])
            ->whereRaw('LOWER(name) = ?', [strtolower($data['name'])])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
        abort_if($duplicate, 422, "{$data['name']} of {$data['academic_year']} already exists.");

        // Terms can't overlap -- otherwise "which term is it today?" has two answers.
        $overlap = AcademicTerm::where('school_id', $schoolId)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->whereDate('start_date', '<=', $data['end_date'])
            ->whereDate('end_date', '>=', $data['start_date'])
            ->first();
        if ($overlap) {
            $msg = "These dates overlap with {$overlap->label()} ({$overlap->start_date->format('M j, Y')} – {$overlap->end_date->format('M j, Y')}).";
            abort(response()->json(['message' => $msg, 'errors' => ['start_date' => [$msg]]], 422));
        }

        return $data;
    }
}
