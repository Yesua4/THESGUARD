<?php
namespace App\Services;

use App\Models\ClassRosterEntry;
use App\Models\User;
use PhpOffice\PhpSpreadsheet\IOFactory;

/**
 * Enrolls students from the registrar's class list, matched on Student No.
 *
 * The registrar export (e.g. Class-List.xls) has a few title rows, then a
 * header row "# | Student No. | Name | Program", the students, and a footer
 * with "Section: BSIT 1-G". A plain CSV with student_id/name(/section)
 * columns works too.
 */
class ClassRosterService {

    public static function normalizeStudentId(?string $id): string {
        return strtoupper(trim((string) $id));
    }

    /**
     * @return array{rows: array<int, array{student_id: string, name: string, program: ?string, section: ?string}>, section: ?string}
     */
    public function parse(string $path, ?string $extension = null): array {
        $reader = $extension && in_array(strtolower($extension), ['csv', 'txt'])
            ? IOFactory::createReader('Csv')
            : IOFactory::createReaderForFile($path);
        $reader->setReadDataOnly(true);
        $cells = $reader->load($path)->getActiveSheet()->toArray(null, true, false, false);

        $norm = fn ($v) => strtolower(preg_replace('/[^a-z0-9]/i', '', (string) $v));

        // Header row: the first row with a Student No./ID column and a Name column.
        $headerIndex = null;
        $cols = [];
        foreach ($cells as $i => $row) {
            $found = [];
            foreach ($row as $c => $value) {
                $key = $norm($value);
                if (in_array($key, ['studentno', 'studentnumber', 'studentid', 'idno', 'idnumber'])) $found['student_id'] = $c;
                elseif (in_array($key, ['name', 'fullname', 'studentname'])) $found['name'] = $c;
                elseif (in_array($key, ['program', 'course'])) $found['program'] = $c;
                elseif ($key === 'section') $found['section'] = $c;
            }
            if (isset($found['student_id'], $found['name'])) {
                $headerIndex = $i;
                $cols = $found;
                break;
            }
        }

        // Footer: "Section:" label followed by the value in a later cell.
        $fileSection = null;
        foreach ($cells as $row) {
            $values = array_values(array_filter(array_map(fn ($v) => trim((string) $v), $row), fn ($v) => $v !== ''));
            if (count($values) >= 2 && $norm($values[0]) === 'section') {
                $fileSection = User::normalizeSection($values[1]);
                break;
            }
        }

        $rows = [];
        if ($headerIndex !== null) {
            foreach (array_slice($cells, $headerIndex + 1) as $row) {
                $studentId = self::normalizeStudentId($row[$cols['student_id']] ?? '');
                $name = trim(preg_replace('/\s+/', ' ', (string) ($row[$cols['name']] ?? '')));
                if ($studentId === '' || $name === '') {
                    continue; // blank lines and the footer block
                }
                $rows[] = [
                    'student_id' => $studentId,
                    'name'       => $name,
                    'program'    => isset($cols['program']) ? (trim((string) ($row[$cols['program']] ?? '')) ?: null) : null,
                    'section'    => isset($cols['section']) ? (User::normalizeSection($row[$cols['section']] ?? '') ?: null) : null,
                ];
            }
        }

        return ['rows' => $rows, 'section' => $fileSection];
    }

    /**
     * Records each row on the school's roster and enrolls whoever already
     * has an account with that Student No.
     */
    public function enroll(User $instructor, array $rows, ?string $defaultSection): array {
        $report = ['enrolled' => [], 'waiting' => [], 'mismatches' => [], 'skipped' => []];

        foreach ($rows as $row) {
            $section = $row['section'] ?: $defaultSection;
            if (!$section) {
                $report['skipped'][] = "{$row['student_id']} ({$row['name']}): no section.";
                continue;
            }
            if (!$instructor->handlesSection($section)) {
                $report['skipped'][] = "{$row['student_id']} ({$row['name']}): {$section} is not one of your sections.";
                continue;
            }

            $student = User::whereRaw('UPPER(TRIM(student_id)) = ?', [$row['student_id']])->first();

            if ($student && ($student->role !== 'student' || $student->assignedRoles() !== ['student'])) {
                $report['skipped'][] = "{$row['student_id']} ({$row['name']}): this Student No. belongs to a staff account.";
                continue;
            }
            if ($student && $student->school_id && (int) $student->school_id !== (int) $instructor->school_id) {
                $report['skipped'][] = "{$row['student_id']} ({$row['name']}): already enrolled in another school.";
                continue;
            }

            $entry = ClassRosterEntry::updateOrCreate(
                ['school_id' => $instructor->school_id, 'student_id' => $row['student_id']],
                [
                    'name'          => $row['name'],
                    'section'       => $section,
                    'program'       => $row['program'],
                    'instructor_id' => $instructor->id,
                ]
            );

            if (!$student) {
                $entry->update(['user_id' => null, 'name_mismatch' => false, 'enrolled_at' => null]);
                $report['waiting'][] = ['student_id' => $row['student_id'], 'name' => $row['name']];
                continue;
            }

            $mismatch = $this->linkStudent($entry, $student);
            $item = ['student_id' => $row['student_id'], 'name' => $row['name'], 'account_name' => $student->name];
            $report['enrolled'][] = $item;
            if ($mismatch) {
                $report['mismatches'][] = $item;
            }
        }

        return $report;
    }

    /**
     * A student just registered: if their Student No. is on a class list
     * that's still waiting for them, enroll them into that school/section.
     */
    public function claimForNewStudent(User $student): ?ClassRosterEntry {
        $entry = ClassRosterEntry::where('student_id', self::normalizeStudentId($student->student_id))
            ->whereNull('user_id')
            ->latest('updated_at')
            ->first();
        if (!$entry) {
            return null;
        }
        $this->linkStudent($entry, $student);
        return $entry;
    }

    // Puts the student in the entry's school and section. Returns whether
    // the account name differs from the class-list name (flagged, not blocked).
    private function linkStudent(ClassRosterEntry $entry, User $student): bool {
        $mismatch = !self::namesMatch($student, $entry->name);

        $student->forceFill([
            'school_id'           => $entry->school_id,
            'section'             => $entry->section,
            'awaiting_enrollment' => false,
            // Enrolled by an instructor of an institute -> the student joins it.
            'institute_id'        => $student->institute_id ?? ($entry->instructor_id ? User::whereKey($entry->instructor_id)->value('institute_id') : null),
        ])->save();
        $entry->update([
            'user_id'       => $student->id,
            'name_mismatch' => $mismatch,
            'enrolled_at'   => $entry->enrolled_at ?? now(),
        ]);

        // A waiting student gets in the moment this happens.
        app(LiveUpdateService::class)->account($student->id, 'enrolled');

        return $mismatch;
    }

    /**
     * Class lists print "LAST, FIRST MIDDLE"; accounts are "First Middle Last".
     * Compares the words, ignoring order, punctuation and initials; matches if
     * one name's words are all in the other (so a missing middle name is fine).
     */
    public static function namesMatch(User $student, string $rosterName): bool {
        $words = function (string $s): array {
            $s = strtoupper(preg_replace('/[^\p{L}\s-]/u', ' ', $s));
            $parts = preg_split('/[\s-]+/', $s, -1, PREG_SPLIT_NO_EMPTY);
            return array_values(array_unique(array_filter($parts, fn ($w) => mb_strlen($w) > 1)));
        };

        $account = $words(trim(implode(' ', array_filter([
            $student->first_name, $student->middle_name, $student->last_name,
        ]))) ?: (string) $student->name);
        $roster = $words($rosterName);

        if (!$account || !$roster) {
            return false;
        }
        return !array_diff($account, $roster) || !array_diff($roster, $account);
    }
}
