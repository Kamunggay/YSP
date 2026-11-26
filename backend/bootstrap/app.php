<?php

use App\Exceptions\ContractException;
use App\Http\BrowserSessionHttp;
use App\Http\Middleware\EnforceBrowserAuthority;
use App\Http\Middleware\EnforceChapterContext;
use App\Http\Middleware\EnforceDutyAuthority;
use App\Http\Middleware\EnforceStageOneAction;
use App\Http\Middleware\EnforceStageOneChapter;
use App\Http\Middleware\IdempotentOperation;
use App\Http\Requests\PaperEvidenceUpload;
use App\Models\User;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustProxies(headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO);

        $middleware->alias([
            'browser.authority' => EnforceBrowserAuthority::class,
            'stage-one.chapter' => EnforceStageOneChapter::class,
            'stage-one.action' => EnforceStageOneAction::class,
            'chapter.context' => EnforceChapterContext::class,
            'duty.authority' => EnforceDutyAuthority::class,
            'idempotent' => IdempotentOperation::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->dontReport(ContractException::class);
        $exceptions->render(function (PostTooLargeException $exception, Request $request) {
            if ($request->isMethod('POST') && $request->is('api/v1/chapters/*/evidence')) {
                return BrowserSessionHttp::noStore(EnforceBrowserAuthority::error(PaperEvidenceUpload::tooLarge()));
            }
        });
        $exceptions->render(function (ContractException $exception, Request $request) {
            if ($request->user() instanceof User) {
                return BrowserSessionHttp::noStore(EnforceBrowserAuthority::error($exception));
            }
        });
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
