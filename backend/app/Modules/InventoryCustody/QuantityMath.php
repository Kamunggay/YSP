<?php

declare(strict_types=1);

namespace App\Modules\InventoryCustody;

use InvalidArgumentException;

/**
 * Exact fixed-point arithmetic for DECIMAL(20,6) quantities and DECIMAL(20,2) PHP money without ext-bcmath.
 */
final class QuantityMath
{
    public const int MIN_SCALE = 0;

    public const int MAX_SCALE = 6;

    private const string WIRE = '/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/';

    private const string MONEY = '/^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$/';

    /** @var array<int, string> */
    private const array SCALES = [
        0 => '/^(?:0|[1-9][0-9]{0,13})(?:\.0{1,6})?$/', 1 => '/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]0{0,5})?$/',
        2 => '/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,2}0{0,4})?$/', 3 => '/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,3}0{0,3})?$/',
        4 => '/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4}0{0,2})?$/', 5 => '/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,5}0?)?$/',
        6 => self::WIRE,
    ];

    public static function assertValidScale(int $scale): void
    {
        if ($scale < self::MIN_SCALE || $scale > self::MAX_SCALE) {
            throw new InvalidArgumentException("Invalid quantity_scale {$scale}; expected 0..6.");
        }
    }

    public static function isValidWire(string $v, int $scale): bool
    {
        return $scale >= 0 && $scale <= 6 && preg_match(self::WIRE, $v) === 1 && preg_match(self::SCALES[$scale], $v) === 1;
    }

    public static function toMicroString(string $v, ?int $scale = null): string
    {
        $t = trim($v);
        if ($t === '' || str_starts_with($t, '-')) {
            throw new InvalidArgumentException("Negative or empty quantity is not allowed: '{$v}'.");
        }
        if ($scale !== null && ! self::isValidWire($t, $scale)) {
            throw new InvalidArgumentException("Quantity '{$t}' violates quantity_scale {$scale}.");
        }
        if (preg_match(self::WIRE, $t) !== 1) {
            throw new InvalidArgumentException("Quantity '{$t}' violates DECIMAL(20,6) syntax.");
        }
        [$whole, $frac] = array_pad(explode('.', $t, 2), 2, '');

        return ltrim($whole.str_pad($frac, 6, '0'), '0') ?: '0';
    }

    public static function dbToMicroString(string|int|float|null $dbValue): string
    {
        if ($dbValue === null) {
            return '0';
        }
        $raw = trim((string) $dbValue);
        if (preg_match('/^[0-9]{1,14}(?:\.[0-9]{1,6})?$/', $raw) !== 1) {
            throw new InvalidArgumentException("Malformed database DECIMAL(20,6) value '{$raw}'.");
        }
        [$whole, $frac] = array_pad(explode('.', $raw, 2), 2, '');

        return ltrim((ltrim($whole, '0') ?: '0').str_pad($frac, 6, '0'), '0') ?: '0';
    }

    public static function microToDbString(string $micro): string
    {
        $p = str_pad(self::norm($micro), 7, '0', STR_PAD_LEFT);

        return substr($p, 0, -6).'.'.substr($p, -6);
    }

    public static function microToWireString(string $micro, int $scale): string
    {
        self::assertValidScale($scale);
        $clean = self::norm($micro);
        if ($clean === '0') {
            return '0';
        }
        $p = str_pad($clean, 7, '0', STR_PAD_LEFT);
        $whole = ltrim(substr($p, 0, -6), '0') ?: '0';
        $frac = substr($p, -6);
        $excess = substr($frac, $scale);
        if ($excess !== '' && ltrim($excess, '0') !== '') {
            throw new InvalidArgumentException("Fractional precision exceeds quantity_scale={$scale} in '{$micro}'.");
        }
        $kept = $scale === 0 ? '' : rtrim(substr($frac, 0, $scale), '0');

        return $kept === '' ? $whole : "{$whole}.{$kept}";
    }

    /** @return array{value: string, quantity_scale: int} */
    public static function toUnitQuantity(string $micro, int $scale): array
    {
        return ['value' => self::microToWireString($micro, $scale), 'quantity_scale' => $scale];
    }

    public static function cmp(string $a, string $b): int
    {
        [$na, $nb] = [self::norm($a), self::norm($b)];

        return strlen($na) !== strlen($nb) ? strlen($na) <=> strlen($nb) : strcmp($na, $nb);
    }

    public static function min(string $a, string $b): string
    {
        return self::cmp($a, $b) <= 0 ? self::norm($a) : self::norm($b);
    }

    public static function max(string $a, string $b): string
    {
        return self::cmp($a, $b) >= 0 ? self::norm($a) : self::norm($b);
    }

    public static function add(string $a, string $b): string
    {
        [$na, $nb] = [self::norm($a), self::norm($b)];
        [$i, $j, $carry, $res] = [strlen($na) - 1, strlen($nb) - 1, 0, ''];
        while ($i >= 0 || $j >= 0 || $carry > 0) {
            $sum = ($i >= 0 ? (int) $na[$i--] : 0) + ($j >= 0 ? (int) $nb[$j--] : 0) + $carry;
            $res = ($sum % 10).$res;
            $carry = intdiv($sum, 10);
        }

        return self::norm($res);
    }

    public static function sub(string $a, string $b): string
    {
        [$na, $nb] = [self::norm($a), self::norm($b)];
        if (self::cmp($na, $nb) < 0) {
            throw new InvalidArgumentException("Quantity underflow: {$na} < {$nb}.");
        }
        [$i, $j, $borrow, $res] = [strlen($na) - 1, strlen($nb) - 1, 0, ''];
        while ($i >= 0) {
            $da = (int) $na[$i--] - $borrow;
            $db = $j >= 0 ? (int) $nb[$j--] : 0;
            $borrow = $da < $db ? 1 : 0;
            $res = (($da + ($borrow * 10)) - $db).$res;
        }

        return self::norm($res);
    }

    public static function isValidMoney(string $v): bool
    {
        return preg_match(self::MONEY, trim($v)) === 1;
    }

    public static function toCents(string $v): int
    {
        if (! self::isValidMoney($v)) {
            throw new InvalidArgumentException("Money value '{$v}' must match two-decimal format.");
        }
        [$whole, $frac] = explode('.', trim($v), 2);

        return ((int) $whole * 100) + (int) $frac;
    }

    public static function fromCents(int $cents): string
    {
        $sign = $cents < 0 ? '-' : '';
        $abs = abs($cents);

        return $sign.intdiv($abs, 100).'.'.str_pad((string) ($abs % 100), 2, '0', STR_PAD_LEFT);
    }

    private static function norm(string $micro): string
    {
        if (preg_match('/^[0-9]+$/', $micro) !== 1) {
            throw new InvalidArgumentException("Invalid micro-unit integer string: '{$micro}'.");
        }

        return ltrim($micro, '0') ?: '0';
    }
}
