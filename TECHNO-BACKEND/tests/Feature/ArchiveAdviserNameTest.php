<?php

namespace Tests\Feature;

use App\Models\School;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// An archived project keeps its adviser's name even after the adviser's
// account is gone, and an imported name that matches no account is kept too.
class ArchiveAdviserNameTest extends TestCase
{
    use RefreshDatabase;

    public function test_archive_keeps_adviser_names_without_their_accounts(): void
    {
        Http::fake(['*' => Http::response([], 500)]); // no similarity/embedding service in tests
        $school  = School::create(['name' => 'S', 'slug' => 's', 'email' => 's@s.com']);
        $admin   = User::factory()->role('admin')->school($school->id)->create();
        $adviser = User::factory()->role('adviser')->school($school->id)->create(['name' => 'Maria Santos']);

        $csv = "title,abstract,objectives,keywords,batch,program,adviser\n"
             . "Library System,Books,Track books,library,2023-2024,BSIT,Maria Santos\n"
             . "Clinic Queue,Patients,Shorten waits,clinic,Not shown in the page,BSIT,Jose Rizal\n";
        Sanctum::actingAs($admin);
        $this->postJson('/api/projects/import', ['file' => UploadedFile::fake()->createWithContent('archive.csv', $csv)])->assertSuccessful();

        $adviser->delete();

        $rows = collect($this->getJson('/api/archive')->assertOk()->json())->keyBy('title');
        $this->assertSame('Maria Santos', $rows['Library System']['adviser_name']);
        $this->assertNull($rows['Library System']['adviser']);
        $this->assertSame('Jose Rizal', $rows['Clinic Queue']['adviser_name']);
        $this->assertNull($rows['Clinic Queue']['batch']); // a note is not a year
    }
}
