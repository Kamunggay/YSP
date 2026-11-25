<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OpeningRecordHistory extends Model
{
    use HasFactory, HasUuids;

    public $timestamps = false;

    protected $table = 'opening_record_history';

    protected $fillable = [
        'id',
        'chapter_id',
        'record_type',
        'record_id',
        'revision',
        'material_version',
        'event_type',
        'actor_user_id',
        'snapshot_json',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'material_version' => 'integer',
            'snapshot_json' => 'array',
            'created_at' => 'datetime',
        ];
    }
}
