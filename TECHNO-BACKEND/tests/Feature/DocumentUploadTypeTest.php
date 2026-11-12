<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// Some real .docx files (Google Docs, LibreOffice, generators) are sniffed as
// plain "application/zip". They must still upload, and be stored as .docx.
class DocumentUploadTypeTest extends TestCase
{
    use RefreshDatabase;

    private Project $project;
    private array $tmp = [];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        $student = User::factory()->role('student')->create();
        $this->project = Project::create(['title' => 'T', 'title_status' => 'approved']);
        ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $student->id, 'is_leader' => true]);
        Sanctum::actingAs($student);
    }

    protected function tearDown(): void
    {
        foreach ($this->tmp as $f) @unlink($f);
        parent::tearDown();
    }

    // A ZIP whose first entry isn't [Content_Types].xml -- what makes PHP
    // report it as application/zip instead of a Word document.
    private function zipFile(string $name, array $entries): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'tg') . '.zip';
        $this->tmp[] = $path;
        $zip = new \ZipArchive();
        $zip->open($path, \ZipArchive::CREATE);
        foreach ($entries as $entry => $body) $zip->addFromString($entry, $body);
        $zip->close();
        return new UploadedFile($path, $name, null, null, true);
    }

    private function upload(UploadedFile $file)
    {
        return $this->postJson('/api/documents', ['project_id' => $this->project->id, 'type' => 'chapter1', 'file' => $file]);
    }

    public function test_a_docx_detected_as_zip_is_accepted_and_stored_as_docx(): void
    {
        $file = $this->zipFile('Chapter_1.docx', [
            'docProps/app.xml' => '<Properties/>',
            'word/document.xml' => '<w:document/>',
            '[Content_Types].xml' => '<Types/>',
        ]);
        $this->assertSame('application/zip', $file->getMimeType(), 'precondition: sniffed as a plain ZIP');

        $this->upload($file)->assertStatus(201);
        $this->assertStringEndsWith('.docx', Document::first()->file_path);
    }

    public function test_a_renamed_zip_that_is_not_a_word_file_is_rejected(): void
    {
        $this->upload($this->zipFile('notes.docx', ['readme.txt' => 'hello']))->assertStatus(422);
        $this->assertSame(0, Document::count());
    }

    public function test_other_file_types_are_still_rejected(): void
    {
        $this->upload(UploadedFile::fake()->create('virus.exe', 5, 'application/octet-stream'))->assertStatus(422);
        $this->upload($this->zipFile('archive.zip', ['word/document.xml' => '<w:document/>']))->assertStatus(422);
    }

    public function test_a_normal_pdf_still_uploads(): void
    {
        $this->upload(UploadedFile::fake()->create('c1.pdf', 5, 'application/pdf'))->assertStatus(201);
        $this->assertStringEndsWith('.pdf', Document::first()->file_path);
    }
}
