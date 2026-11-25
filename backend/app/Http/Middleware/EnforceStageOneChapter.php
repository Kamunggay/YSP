<?php

namespace App\Http\Middleware;

use App\Exceptions\ContractException;
use App\Http\Requests\AuthInput;
use App\Services\Authority\ChapterAuthority;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforceStageOneChapter
{
    public function handle(Request $request, Closure $next): Response
    {
        $chapterId = $request->route('chapter_id');
        if (! preg_match(AuthInput::UUID, $chapterId)) {
            throw new ContractException(400, 'invalid_selector', 'Invalid chapter selector.');
        }

        $authority = ChapterAuthority::forChapter($request->user(), $chapterId);
        $request->attributes->set(ChapterAuthority::class, $authority);
        $request->attributes->set('chapter', $authority->chapter);
        $request->attributes->set('membership', $authority->membership);

        return $next($request);
    }
}
