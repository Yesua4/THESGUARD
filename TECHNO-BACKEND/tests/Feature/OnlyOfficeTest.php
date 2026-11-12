<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\Group;
use App\Models\GroupMember;
use App\Models\Project;
use App\Models\ProjectMember;
use App\Models\School;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

// ONLYOFFICE editing: off until configured; students of the project edit the
// newest .docx, everyone else views; saves come back as a new version, only
// with a valid token and only from our own Document Server.
class OnlyOfficeTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret-0123456789-abcdefghij';
    private Project $project;
    private User $student;
    private User $adviser;
    private Document $doc;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        config([
            'services.onlyoffice.url' => 'https://docs.example.org',
            'services.onlyoffice.jwt_secret' => self::SECRET,
            'services.onlyoffice.backend_url' => 'https://api.example.org',
        ]);
        $school = School::create(['name' => 'S', 'slug' => 's', 'email' => 's@s.com']);
        $this->adviser = User::factory()->role('adviser')->school($school->id)->create();
        $this->student = User::factory()->role('student')->school($school->id)->create();
        $group = Group::create(['group_name' => 'G', 'school_id' => $school->id, 'adviser_id' => $this->adviser->id]);
        GroupMember::create(['group_id' => $group->id, 'user_id' => $this->student->id]);
        $this->project = Project::create(['title' => 'P', 'school_id' => $school->id, 'group_id' => $group->id, 'adviser_id' => $this->adviser->id, 'title_status' => 'approved', 'status' => 'ongoing']);
        ProjectMember::create(['project_id' => $this->project->id, 'user_id' => $this->student->id]);
        Storage::disk('local')->put('documents/1/ch1.docx', 'original');
        $this->doc = Document::create(['project_id' => $this->project->id, 'uploaded_by' => $this->student->id, 'type' => 'chapter1', 'version' => 1, 'file_path' => 'documents/1/ch1.docx', 'status' => 'pending']);
    }

    public function test_off_until_configured(): void
    {
        config(['services.onlyoffice.url' => null]);
        Sanctum::actingAs($this->student);
        $this->getJson('/api/onlyoffice/status')->assertJsonPath('enabled', false);
        $this->getJson("/api/documents/{$this->doc->id}/onlyoffice")->assertStatus(503);
    }

    public function test_student_edits_and_adviser_views_with_a_signed_config(): void
    {
        Sanctum::actingAs($this->student);
        $res = $this->getJson("/api/documents/{$this->doc->id}/onlyoffice")->assertOk()->assertJsonPath('mode', 'edit');
        $config = $res->json('config');
        $this->assertStringStartsWith('https://api.example.org/api/onlyoffice/file/', $config['document']['url']);
        $decoded = (array) JWT::decode($config['token'], new \Firebase\JWT\Key(self::SECRET, 'HS256'));
        $this->assertSame($config['document']['key'], $decoded['document']->key);

        Sanctum::actingAs($this->adviser);
        $this->getJson("/api/documents/{$this->doc->id}/onlyoffice")->assertOk()->assertJsonPath('mode', 'view');

        Sanctum::actingAs(User::factory()->role('student')->create());
        $this->getJson("/api/documents/{$this->doc->id}/onlyoffice")->assertStatus(403);
    }

    public function test_file_download_needs_a_valid_signature(): void
    {
        $this->get("/api/onlyoffice/file/{$this->doc->id}")->assertStatus(403);
        $this->get(URL::temporarySignedRoute('onlyoffice.file', now()->addHour(), ['id' => $this->doc->id], false))->assertOk();
    }

    private function sendCallback(array $body)
    {
        $url = URL::temporarySignedRoute('onlyoffice.callback', now()->addHour(), ['id' => $this->doc->id], false);
        return $this->postJson($url, ['token' => JWT::encode($body, self::SECRET, 'HS256')] + $body);
    }

    public function test_closing_the_editor_saves_a_new_version_once(): void
    {
        Http::fake(['docs.example.org/*' => Http::response('edited docx bytes', 200)]);
        $body = ['key' => 'tg1-abc', 'status' => 2, 'url' => 'https://docs.example.org/cache/files/out.docx', 'users' => [(string) $this->student->id]];

        $this->sendCallback($body)->assertOk()->assertJsonPath('error', 0);
        $this->sendCallback($body)->assertOk()->assertJsonPath('error', 0); // repeated -> no duplicate

        $versions = Document::where('project_id', $this->project->id)->where('type', 'chapter1')->orderBy('version')->get();
        $this->assertCount(2, $versions);
        $this->assertSame((int) $this->student->id, (int) $versions[1]->uploaded_by);
        $this->assertSame('edited docx bytes', Storage::disk('local')->get($versions[1]->file_path));
    }

    public function test_a_document_server_clock_a_little_ahead_is_accepted(): void
    {
        // The Document Server signs with its own clock; a second or two ahead of
        // ours must not make every callback look "issued in the future" (403).
        Http::fake(['docs.example.org/*' => Http::response('edited docx bytes', 200)]);
        $body = ['key' => 'tg1-clock', 'status' => 2, 'url' => 'https://docs.example.org/cache/files/out.docx',
            'users' => [(string) $this->student->id], 'iat' => time() + 5, 'exp' => time() + 305];
        $this->sendCallback($body)->assertOk()->assertJsonPath('error', 0);

        // ...but a token from far in the future is still refused.
        $far = ['key' => 'tg1-far', 'status' => 1, 'iat' => time() + 3600, 'exp' => time() + 4000];
        $this->sendCallback($far)->assertStatus(403);
    }

    public function test_callback_refuses_bad_tokens_and_foreign_file_hosts(): void
    {
        $url = URL::temporarySignedRoute('onlyoffice.callback', now()->addHour(), ['id' => $this->doc->id], false);
        $this->postJson($url, ['token' => JWT::encode(['status' => 2], 'wrong-secret-wrong-secret-wrong-secret', 'HS256'), 'status' => 2])->assertStatus(403);

        Http::fake();
        $this->sendCallback(['key' => 'tg1-x', 'status' => 2, 'url' => 'https://evil.example.com/file.docx'])->assertJsonPath('error', 1);
        Http::assertNothingSent();
        $this->assertSame(1, Document::where('project_id', $this->project->id)->count());
    }

    public function test_the_defense_laptop_registers_its_address_which_lapses(): void
    {
        config(['services.onlyoffice.url' => null]);
        Sanctum::actingAs($this->student);
        $this->getJson('/api/onlyoffice/status')->assertJsonPath('enabled', false);

        $token = fn ($url, $ttl = 300) => JWT::encode(['purpose' => 'register', 'url' => $url, 'exp' => time() + $ttl], self::SECRET, 'HS256');
        $this->postJson('/api/onlyoffice/register', ['token' => $token('https://abc-def.trycloudflare.com')])->assertOk()->assertJsonPath('enabled', true);
        $this->getJson('/api/onlyoffice/status')->assertJsonPath('server_url', 'https://abc-def.trycloudflare.com');

        // Wrong secret, long-lived token, or plain http: refused.
        $this->postJson('/api/onlyoffice/register', ['token' => JWT::encode(['purpose' => 'register', 'url' => 'https://evil.example', 'exp' => time() + 60], 'another-secret-another-secret-12345', 'HS256')])->assertStatus(403);
        $this->postJson('/api/onlyoffice/register', ['token' => $token('https://evil.example', 86400)])->assertStatus(403);
        $this->postJson('/api/onlyoffice/register', ['token' => $token('http://insecure.example')])->assertStatus(422);

        // Lapses on its own after 15 minutes without a refresh.
        $this->travel(16)->minutes();
        $this->getJson('/api/onlyoffice/status')->assertJsonPath('enabled', false);
        $this->travelBack();

        // Stop script switches it off right away.
        $this->postJson('/api/onlyoffice/register', ['token' => $token('https://abc-def.trycloudflare.com')])->assertOk();
        $this->postJson('/api/onlyoffice/register', ['token' => $token(null)])->assertOk()->assertJsonPath('enabled', false);
    }

    public function test_write_in_the_word_editor_starts_blank_and_saves_as_a_version(): void
    {
        Sanctum::actingAs($this->student);
        $config = $this->getJson("/api/projects/{$this->project->id}/onlyoffice-new?type=chapter2")->assertOk()->json('config');
        $this->get(parse_url($config['document']['url'], PHP_URL_PATH) . '?' . parse_url($config['document']['url'], PHP_URL_QUERY))->assertOk();

        // Advisers don't start students' documents.
        Sanctum::actingAs($this->adviser);
        $this->getJson("/api/projects/{$this->project->id}/onlyoffice-new?type=chapter2")->assertStatus(403);

        Http::fake(['docs.example.org/*' => Http::response('new chapter bytes', 200)]);
        $cb = $config['editorConfig']['callbackUrl'];
        $cbPath = parse_url($cb, PHP_URL_PATH) . '?' . parse_url($cb, PHP_URL_QUERY);
        $body = ['key' => $config['document']['key'], 'status' => 2, 'url' => 'https://docs.example.org/cache/out.docx', 'users' => [(string) $this->student->id]];
        $this->postJson($cbPath, ['token' => JWT::encode($body, self::SECRET, 'HS256')] + $body)->assertJsonPath('error', 0);

        $doc = Document::where('project_id', $this->project->id)->where('type', 'chapter2')->sole();
        $this->assertSame(1, (int) $doc->version);
        $this->assertSame((int) $this->student->id, (int) $doc->uploaded_by);

        // Closed without writing anything (status 4): nothing saved.
        $this->postJson($cbPath, ['token' => JWT::encode(['key' => 'other', 'status' => 4], self::SECRET, 'HS256'), 'status' => 4])->assertJsonPath('error', 0);
        $this->assertSame(1, Document::where('project_id', $this->project->id)->where('type', 'chapter2')->count());
    }
}
