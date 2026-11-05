<?php

namespace Tests\Feature;

use App\Models\ClassRosterEntry;
use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Tests\TestCase;

// Students register themselves (name, Student No., email); instructors enroll
// them by importing the registrar's class list, matched on Student No.
class ClassRosterEnrollmentTest extends TestCase
{
    use RefreshDatabase;

    private School $school;

    protected function setUp(): void
    {
        parent::setUp();
        $this->school = School::create(['name' => 'Test School', 'slug' => 'test-school', 'email' => 'a@b.com']);
    }

    // Same layout as the registrar's export: title rows, header, students,
    // then a footer carrying the section. Names here are made up.
    private function classListXls(array $students, ?string $section = 'BSIT 1-G'): UploadedFile
    {
        $sheet = new Spreadsheet();
        $ws = $sheet->getActiveSheet();
        $rows = [
            [], ['Test State College'], ['Class Attendance'], ['1st Trimester,S.Y.2026-2027'], [],
            ['#', 'Student No.', 'Name', 'Program'],
        ];
        foreach ($students as $i => [$no, $name]) {
            $rows[] = [$i + 1, $no, $name, 'BSIT'];
        }
        $rows[] = [];
        $rows[] = ['CourseCode:', '', '', 'Lecture'];
        if ($section) {
            $rows[] = ['Section:', '', $section, 'Days:  T/TH'];
        }
        $rows[] = ['Instructor:', '', 'Test Instructor', ''];
        $ws->fromArray($rows, null, 'A1');

        $path = tempnam(sys_get_temp_dir(), 'cls') . '.xls';
        IOFactory::createWriter($sheet, 'Xls')->save($path);
        return new UploadedFile($path, 'Class-List.xls', 'application/vnd.ms-excel', null, true);
    }

    private function register(array $overrides = [])
    {
        return $this->postJson('/api/register', array_merge([
            'last_name' => 'Dela Cruz', 'first_name' => 'Juan', 'middle_name' => 'Santos',
            'student_id' => '2026-00001', 'email' => 'juan@example.com', 'password' => 'a-long-password-123',
        ], $overrides));
    }

    private function instructor(array $sections = []): User
    {
        $u = User::factory()->role('instructor')->school($this->school->id)->create();
        $u->syncHandledSections($sections);
        return $u->fresh();
    }

    public function test_student_can_self_register_and_waits_for_enrollment(): void
    {
        $res = $this->register()->assertStatus(201);

        $this->assertSame('Juan Santos Dela Cruz', $res->json('user.name'));
        $this->assertSame('student', $res->json('user.role'));
        $this->assertNull($res->json('user.school_id'));
        $this->assertTrue($res->json('user.awaiting_enrollment'));
    }

    public function test_registration_requires_student_number_and_names(): void
    {
        $this->register(['student_id' => ''])->assertStatus(422)->assertJsonValidationErrors('student_id');
        $this->register(['last_name' => ''])->assertStatus(422)->assertJsonValidationErrors('last_name');
    }

    public function test_student_number_must_be_unique(): void
    {
        $this->register()->assertStatus(201);
        $this->register(['email' => 'other@example.com', 'student_id' => ' 2026-00001 '])
            ->assertStatus(422)->assertJsonValidationErrors('student_id');
    }

    public function test_waiting_student_is_blocked_from_everything_but_me(): void
    {
        $this->register()->assertStatus(201);
        $student = User::where('email', 'juan@example.com')->first();
        Sanctum::actingAs($student);

        $this->getJson('/api/me')->assertOk();
        $this->getJson('/api/projects')->assertStatus(403)->assertJsonPath('code', 'not_enrolled');
        $this->getJson('/api/archive')->assertStatus(403);
    }

    public function test_import_enrolls_registered_students_by_student_number(): void
    {
        $this->register()->assertStatus(201);
        $padios = $this->instructor();
        Sanctum::actingAs($padios);

        $res = $this->post('/api/roster/import', ['file' => $this->classListXls([
            ['2026-00001', 'DELA CRUZ, JUAN SANTOS'],
            ['2026-00002', 'REYES, MARIA CLARA'],
        ])], ['Accept' => 'application/json'])->assertOk();

        $this->assertSame('BSIT 1-G', $res->json('section'));
        $this->assertCount(1, $res->json('enrolled'));
        $this->assertCount(1, $res->json('waiting'));
        $this->assertCount(0, $res->json('mismatches'));

        $juan = User::where('student_id', '2026-00001')->first();
        $this->assertSame($this->school->id, $juan->school_id);
        $this->assertSame('BSIT 1-G', $juan->section);
        $this->assertFalse($juan->awaiting_enrollment);

        // And now they're through the gate.
        Sanctum::actingAs($juan);
        $this->getJson('/api/projects')->assertOk();
    }

    public function test_student_who_registers_after_the_import_is_enrolled_automatically(): void
    {
        Sanctum::actingAs($this->instructor());
        $this->post('/api/roster/import', ['file' => $this->classListXls([
            ['2026-00002', 'REYES, MARIA CLARA'],
        ])], ['Accept' => 'application/json'])->assertOk();

        $res = $this->register([
            'last_name' => 'Reyes', 'first_name' => 'Maria', 'middle_name' => 'Clara',
            'student_id' => '2026-00002', 'email' => 'maria@example.com',
        ])->assertStatus(201);

        $this->assertSame($this->school->id, $res->json('user.school_id'));
        $this->assertSame('BSIT 1-G', $res->json('user.section'));
        $this->assertFalse($res->json('user.awaiting_enrollment'));
        $this->assertSame('enrolled', collect($this->getJson('/api/roster')->json())->firstWhere('student_id', '2026-00002')['status']);
    }

    public function test_name_mismatch_still_enrolls_but_is_flagged(): void
    {
        $this->register(['last_name' => 'Garcia', 'first_name' => 'Pedro', 'middle_name' => null])->assertStatus(201);
        Sanctum::actingAs($this->instructor());

        $res = $this->post('/api/roster/import', ['file' => $this->classListXls([
            ['2026-00001', 'DELA CRUZ, JUAN SANTOS'],
        ])], ['Accept' => 'application/json'])->assertOk();

        $this->assertCount(1, $res->json('enrolled'));
        $this->assertCount(1, $res->json('mismatches'));
        $this->assertTrue(ClassRosterEntry::first()->name_mismatch);
    }

    public function test_missing_middle_name_or_initial_is_not_a_mismatch(): void
    {
        $student = new User(['first_name' => 'Jaylan', 'last_name' => 'Borja', 'name' => 'Jaylan Borja']);
        $this->assertTrue(\App\Services\ClassRosterService::namesMatch($student, 'BORJA, JAYLAN B.'));
        $this->assertFalse(\App\Services\ClassRosterService::namesMatch($student, 'SANTOS, MARIA'));
    }

    public function test_scoped_instructor_cannot_import_into_another_section(): void
    {
        Sanctum::actingAs($this->instructor(['BSIT 4A']));

        $this->post('/api/roster/import', ['file' => $this->classListXls([['2026-00002', 'REYES, MARIA']], 'BSIT 1-G')],
            ['Accept' => 'application/json'])->assertStatus(403);

        $this->post('/api/roster/import', ['file' => $this->classListXls([['2026-00002', 'REYES, MARIA']], 'BSIT 1-G'), 'section' => 'BSIT 4A'],
            ['Accept' => 'application/json'])->assertOk();
    }

    public function test_class_list_without_section_requires_choosing_one(): void
    {
        Sanctum::actingAs($this->instructor());

        $this->post('/api/roster/import', ['file' => $this->classListXls([['2026-00002', 'REYES, MARIA']], null)],
            ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('section');
    }

    public function test_students_and_panelists_cannot_import_or_view_the_roster(): void
    {
        $student = User::factory()->role('student')->school($this->school->id)->create();
        Sanctum::actingAs($student);
        $this->getJson('/api/roster')->assertStatus(403);
        $this->post('/api/roster/import', ['file' => $this->classListXls([['2026-00002', 'REYES, MARIA']])], ['Accept' => 'application/json'])->assertStatus(403);

        Sanctum::actingAs(User::factory()->role('panelist')->school($this->school->id)->create());
        $this->getJson('/api/roster')->assertStatus(403);
    }

    public function test_student_enrolled_in_another_school_is_not_moved(): void
    {
        $other = School::create(['name' => 'Other', 'slug' => 'other', 'email' => 'o@b.com']);
        User::factory()->role('student')->school($other->id)->create(['student_id' => '2026-00009', 'section' => 'X']);
        Sanctum::actingAs($this->instructor());

        $res = $this->post('/api/roster/import', ['file' => $this->classListXls([['2026-00009', 'SOMEONE, ELSE']])],
            ['Accept' => 'application/json'])->assertOk();

        $this->assertCount(1, $res->json('skipped'));
        $this->assertSame($other->id, User::where('student_id', '2026-00009')->first()->school_id);
    }

    // Registrar exports are often old .xls files PHP only sniffs as a generic
    // "application/CDFV2" container; the upload is accepted by extension and
    // anything that isn't really a spreadsheet fails cleanly at parse time.
    public function test_upload_is_checked_by_extension_and_unreadable_files_fail_cleanly(): void
    {
        Sanctum::actingAs($this->instructor());

        $junk = UploadedFile::fake()->createWithContent('Class-List.xls', 'not really a spreadsheet');
        $this->post('/api/roster/import', ['file' => $junk], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonMissingPath('errors.file'); // passed validation, rejected by the parser

        $exe = UploadedFile::fake()->createWithContent('Class-List.exe', 'MZ');
        $this->post('/api/roster/import', ['file' => $exe], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('file');
    }

    public function test_staff_created_accounts_are_never_gated(): void
    {
        $student = User::factory()->role('student')->create(); // no school, not self-registered
        Sanctum::actingAs($student);
        $this->getJson('/api/projects')->assertOk();
    }
}
