<?php

namespace App\Http\Controllers;

use App\Models\Buyer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BuyerController extends Controller
{
    public function index(Request $request, string $chapterId): JsonResponse
    {
        $query = Buyer::query()->where('chapter_id', $chapterId);

        if ($request->filled('q') || $request->filled('search')) {
            $search = $request->input('q') ?? $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('organization_name', 'like', "%{$search}%")
                    ->orWhere('contact_person', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $buyers = $query->orderBy('name')->get();

        return response()->json([
            'data' => $buyers,
        ]);
    }

    public function store(Request $request, string $chapterId): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'organization_name' => ['nullable', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string'],
        ]);

        $buyer = Buyer::create([
            'chapter_id' => $chapterId,
            ...$validated,
        ]);

        return response()->json([
            'data' => $buyer,
            'message' => 'Buyer created successfully.',
        ], 201);
    }
}
