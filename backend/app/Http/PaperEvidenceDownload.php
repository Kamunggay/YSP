<?php

namespace App\Http;

use Closure;
use Illuminate\Database\Connection;
use Illuminate\Http\Response;
use PDOException;

final class PaperEvidenceDownload extends Response
{
    public const ACTIONS = ['evidence.read', 'history.read'];

    private ?Connection $authorityFence = null;

    private int $transactionLevel;

    private ?Closure $recheckAuthority = null;

    public function holdAuthority(Connection $connection, int $level, Closure $recheck): void
    {
        $this->authorityFence = $connection;
        $this->transactionLevel = $level;
        $this->recheckAuthority = $recheck;
    }

    public function send(bool $flush = true): static
    {
        if ($this->recheckAuthority === null) {
            return $this;
        }
        try {
            $authorized = ($this->recheckAuthority)();
            if ($authorized !== $this) {
                $this->setStatusCode($authorized->getStatusCode());
                $this->headers = $authorized->headers;
                $this->setContent($authorized->getContent());
            }

            return parent::send($flush);
        } finally {
            $this->releaseAuthority();
        }
    }

    public function releaseAuthority(): void
    {
        $connection = $this->authorityFence;
        $this->authorityFence = null;
        $this->recheckAuthority = null;
        try {
            $connection?->commit();
        } catch (PDOException $exception) {
            try {
                $connection->rollBack($this->transactionLevel);
            } catch (PDOException $rollbackFailure) {
                $connection->disconnect();
                report($rollbackFailure);
            }
            report($exception);
        }
    }
}
