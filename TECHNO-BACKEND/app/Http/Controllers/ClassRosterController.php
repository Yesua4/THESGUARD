<?php
namespace App\Http\Controllers;

use App\Models\ClassRosterEntry;
use App\Models\User;
use App\Services\ClassRosterService;
use Illuminate\Http\Request;

// Enrolling students from the registrar's class list (no emails needed):
// rows are matched to self-registered accounts by Student No.
class ClassRosterController extends Controller {

    private function assertStaff(User $user): void {
        abort_unless(in_array($user->role, ['admin', 'instructor']), 403, 'Only administrators and instructors can enroll students.');
        abort_unless($user->school_id, 403, 'Your account is not attached to a school.');
    }

    public function import(Request $request, ClassRosterService $roster) {
        $user = $request->user();
        $this->assertStaff($user);

        $request->validate([
            'file'    => 'required|file|mimes:xls,xlsx,csv,txt|max:5120',
            'section' => 'nullable|string|max:100',
        ]);

        $file = $request->file('file');
        try {
            $parsed = $roster->parse($file->getPathname(), $file->getClientOriginalExtension());
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Could not read that file. Upload the class list as .xls, .xlsx or .csv.'], 422);
        }

        if (!$parsed['rows']) {
            return response()->json(['message' => 'No students found. The file needs a "Student No." column and a "Name" column.'], 422);
        }

        // The section chosen in the form wins; otherwise the one printed on
        // the class list ("Section: BSIT 1-G"); a scoped instructor with one
        // section falls back to it.
        $section = User::normalizeSection($request->input('section')) ?: $parsed['section'];
        if (!$section && ($scope = $user->sectionScope()) && count($scope) === 1) {
            $section = $scope[0];
        }
        $hasRowSections = collect($parsed['rows'])->contains(fn ($r) => $r['section']);
        if (!$section && !$hasRowSections) {
            return response()->json(['message' => 'This class list has no section on it. Choose the section to enroll these students into.', 'errors' => ['section' => ['Section is required.']]], 422);
        }
        if ($section && !$user->handlesSection($section)) {
            $msg = "{$section} is not one of your sections (" . implode(', ', $user->sectionScope()) . ').';
            return response()->json(['message' => $msg, 'errors' => ['section' => [$msg]]], 403);
        }

        $report = $roster->enroll($user, $parsed['rows'], $section);

        $parts = [count($report['enrolled']) . ' enrolled'];
        if ($report['waiting'])    $parts[] = count($report['waiting']) . ' not signed up yet (they\'ll be enrolled when they register)';
        if ($report['mismatches']) $parts[] = count($report['mismatches']) . ' with a different name on their account';
        if ($report['skipped'])    $parts[] = count($report['skipped']) . ' skipped';

        return response()->json($report + [
            'section' => $section,
            'total'   => count($parsed['rows']),
            'message' => implode(', ', $parts) . '.',
        ]);
    }

    public function index(Request $request) {
        $user = $request->user();
        $this->assertStaff($user);

        $query = ClassRosterEntry::with('user:id,name,email,student_id')
            ->where('school_id', $user->school_id)
            ->orderBy('section')
            ->orderBy('name');

        if ($sections = $user->sectionScope()) {
            User::whereSectionIn($query, 'section', $sections);
        }

        return response()->json($query->get()->map(fn ($e) => [
            'id'            => $e->id,
            'student_id'    => $e->student_id,
            'name'          => $e->name,
            'section'       => $e->section,
            'program'       => $e->program,
            'status'        => $e->user_id ? 'enrolled' : 'waiting',
            'name_mismatch' => $e->name_mismatch,
            'account'       => $e->user ? ['id' => $e->user->id, 'name' => $e->user->name, 'email' => $e->user->email] : null,
            'enrolled_at'   => $e->enrolled_at,
        ]));
    }

    // Removes a roster row (e.g. a student who dropped). An already-enrolled
    // account is left as is -- manage it from User Accounts.
    public function destroy(Request $request, $id) {
        $user = $request->user();
        $this->assertStaff($user);

        $entry = ClassRosterEntry::where('school_id', $user->school_id)->findOrFail($id);
        abort_unless($user->handlesSection($entry->section), 403, 'This student is not in a section you handle.');

        $entry->delete();
        return response()->json(['message' => 'Removed from the roster.']);
    }
}
