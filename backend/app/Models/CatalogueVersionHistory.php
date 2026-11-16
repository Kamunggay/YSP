<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CatalogueVersionHistory extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'catalogue_version_history';

    protected $guarded = [];

    protected $casts = [
        'version' => 'integer',
        'snapshot' => 'array',
    ];
}
