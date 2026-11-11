<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Project extends Model {
    protected $fillable = [
        'title', 'description', 'abstract', 'abstract_is_final', 'objectives', 'keywords', 'group_id',
        'batch', 'program', 'adviser_id', 'adviser_name', 'instructor_id', 'status',
        'similarity_score', 'title_status', 'is_final_title', 'defense_verdict', 'github_url', 'title_feedback', 'school_id'
    ];
    // The adviser's name is kept as text too, so an archived record still
    // shows it after that account is removed.
    protected static function booted(): void {
        static::saving(function (Project $p) {
            if ($p->adviser_id && ($p->isDirty('adviser_id') || !$p->adviser_name)) {
                $p->adviser_name = User::whereKey($p->adviser_id)->value('name') ?? $p->adviser_name;
            }
        });
    }

    public const EMBEDDINGS = ['title_embedding', 'abstract_embedding', 'objectives_embedding'];

    // Large vectors used only on the server for similarity; never sent out.
    protected $hidden = self::EMBEDDINGS;

    // Every column except the embeddings, so lists don't pull them from
    // the database at all (they were most of the plan's data transfer).
    public function scopeWithoutEmbeddings($query) {
        static $columns = null;
        $columns ??= array_values(array_diff(\Illuminate\Support\Facades\Schema::getColumnListing('projects'), self::EMBEDDINGS));
        return $query->select(array_map(fn ($c) => 'projects.' . $c, $columns));
    }

    protected $casts = [
        'is_final_title'       => 'boolean',
        'title_embedding'      => 'array',
        'abstract_embedding'   => 'array',
        'abstract_is_final'    => 'boolean',
        'objectives_embedding' => 'array',
    ];

    public function adviser() {
        return $this->belongsTo(User::class, 'adviser_id');
    }

    public function instructor() {
        return $this->belongsTo(User::class, 'instructor_id');
    }

    public function members() {
        return $this->hasMany(ProjectMember::class)->with('user');
    }

    public function documents() {
        return $this->hasMany(Document::class);
    }

    public function schedule() {
        return $this->hasOne(DefenseSchedule::class);
    }
    public function group() {
    return $this->belongsTo(Group::class);
    }
}