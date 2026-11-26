<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ChapterOpeningGuard extends Model
{
    protected $table = 'chapter_opening_guards';

    protected $primaryKey = 'chapter_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'chapter_id',
        'stock_version',
        'posted_rm_id',
        'posted_ipc_id',
        'outcome_id',
        'outcome_json',
        'posted_at',
    ];

    protected function casts(): array
    {
        return [
            'stock_version' => 'integer',
            'outcome_json' => 'array',
            'posted_at' => 'datetime',
        ];
    }
}
