<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReferenceSequence extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'reference_sequences';

    protected $fillable = [
        'id',
        'chapter_id',
        'document_kind',
        'sequence_year',
        'prefix',
        'last_sequence',
        'sequence_width',
    ];

    protected function casts(): array
    {
        return [
            'sequence_year' => 'integer',
            'last_sequence' => 'integer',
            'sequence_width' => 'integer',
        ];
    }
}
