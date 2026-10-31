<?php

namespace App\Http\Controllers;

use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('SELECT 1');
        } catch (QueryException $exception) {
            report($exception);

            return response()->json(['database' => 'unavailable'], 503);
        }

        return response()->json(['database' => 'connected']);
    }
}
