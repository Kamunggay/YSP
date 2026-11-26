<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var list<string> */
    private array $mutable = ['work_queue_items', 'report_output_jobs', 'operations_map_states'];

    /** @var list<string> */
    private array $immutable = ['operations_map_audit_events'];

    public function up(): void
    {
        Schema::create('work_queue_items', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('bucket', 24)->charset('ascii')->collation('ascii_bin')->default('needs_my_action');
            $t->string('source_module', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('item_kind', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('title', 160);
            $t->string('description', 255);
            $t->string('required_duty', 40)->charset('ascii')->collation('ascii_bin');
            $t->boolean('is_uncertain_outcome')->default(false);
            $t->unsignedTinyInteger('urgency_rank')->default(50);
            $t->unsignedBigInteger('assigned_user_id')->nullable();
            $t->string('action_state', 16)->charset('ascii')->collation('ascii_bin')->default('pending');
            $t->string('reference_code', 64)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->unsignedInteger('row_version')->default(1);
            $t->timestamp('occurred_at', 6);
            $t->timestamps(6);
            $t->index(['chapter_id', 'bucket', 'is_uncertain_outcome', 'urgency_rank', 'id'], 'wq_filter_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('assigned_user_id')->references('id')->on('users');
        });
        DB::statement("ALTER TABLE work_queue_items ADD CONSTRAINT wq_bucket_chk CHECK (bucket IN ('needs_my_action','waiting_on_others','resolved_history')), ADD CONSTRAINT wq_state_chk CHECK (action_state IN ('pending','in_progress','completed','dismissed')), ADD CONSTRAINT wq_ver_chk CHECK (row_version >= 1)");

        Schema::create('report_output_jobs', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('report_group', 24)->charset('ascii')->collation('ascii_bin');
            $t->string('report_code', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('date_basis', 32)->charset('ascii')->collation('ascii_bin');
            $t->date('period_from');
            $t->date('period_to');
            $t->string('format', 8)->charset('ascii')->collation('ascii_bin');
            $t->string('status', 16)->charset('ascii')->collation('ascii_bin')->default('generated');
            $t->string('required_duty', 40)->charset('ascii')->collation('ascii_bin');
            $t->unsignedBigInteger('requested_by_user_id');
            $t->boolean('reposted_effect')->default(false);
            $t->unsignedInteger('retry_count')->default(0);
            $t->unsignedInteger('row_version')->default(1);
            $t->string('file_name', 160);
            $t->string('mime_type', 80);
            $t->mediumText('content_text')->nullable();
            $t->string('failure_reason', 255)->nullable();
            $t->timestamp('generated_at', 6)->nullable();
            $t->timestamps(6);
            $t->index(['chapter_id', 'report_group', 'date_basis'], 'rep_jobs_filter_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('requested_by_user_id')->references('id')->on('users');
        });
        DB::statement("ALTER TABLE report_output_jobs ADD CONSTRAINT rep_grp_chk CHECK (report_group IN ('inventory','demand_procurement','finance_booth','control_audit')), ADD CONSTRAINT rep_basis_chk CHECK (date_basis IN ('actual_occurrence','entry_verification_posting')), ADD CONSTRAINT rep_fmt_chk CHECK (format IN ('pdf','csv')), ADD CONSTRAINT rep_status_chk CHECK (status IN ('generated','failed','retried')), ADD CONSTRAINT rep_ver_chk CHECK (row_version >= 1)");

        Schema::create('operations_map_states', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id')->unique();
            $t->string('active_view', 32)->charset('ascii')->collation('ascii_bin')->default('view_1_swimlanes');
            $t->string('active_scenario', 32)->charset('ascii')->collation('ascii_bin')->default('track1_so_backorder');
            $t->boolean('text_alternative_enabled')->default(false);
            $t->boolean('map_unavailable')->default(false);
            $t->unsignedInteger('row_version')->default(1);
            $t->unsignedBigInteger('updated_by_user_id')->nullable();
            $t->timestamp('updated_at', 6);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('updated_by_user_id')->references('id')->on('users');
        });
        DB::statement("ALTER TABLE operations_map_states ADD CONSTRAINT om_view_chk CHECK (active_view IN ('view_1_swimlanes','view_2_money_or','view_3_stocks_custody','view_4_governance_matrix','view_5_scenario_tracer')), ADD CONSTRAINT om_scen_chk CHECK (active_scenario IN ('track1_so_backorder','track2_booth_100_30_70','purchasing_po_100_rm_40')), ADD CONSTRAINT om_ver_chk CHECK (row_version >= 1)");

        Schema::create('operations_map_audit_events', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('actor_user_id')->nullable();
            $t->string('event_type', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('view_code', 48)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->string('scenario_code', 48)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->string('node_code', 64)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->string('outcome', 16)->charset('ascii')->collation('ascii_bin');
            $t->string('detail', 255)->nullable();
            $t->timestamp('occurred_at', 6);
            $t->index(['chapter_id', 'id'], 'om_audit_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('actor_user_id')->references('id')->on('users');
        });
        DB::statement("ALTER TABLE operations_map_audit_events ADD CONSTRAINT om_audit_outcome_chk CHECK (outcome IN ('allowed','denied','unavailable'))");

        foreach ($this->immutable as $tbl) {
            foreach (['UPDATE', 'DELETE'] as $ev) {
                $act = strtolower($ev);
                DB::unprepared("CREATE TRIGGER tr_{$tbl}_no_{$act} BEFORE {$ev} ON {$tbl} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMMUTABLE_RECORD: {$ev} forbidden on {$tbl}.'");
            }
        }

        $conn = DB::connection();
        $user = (string) config('database.runtime_username');
        $host = (string) config('database.runtime_host');
        $exists = DB::selectOne('SELECT EXISTS(SELECT 1 FROM mysql.user WHERE user = ? AND host = ?) AS found', [$user, $host]);
        if ($exists && (int) $exists->found === 1) {
            $pdo = $conn->getPdo();
            $account = $pdo->quote($user).'@'.$pdo->quote($host);
            $db = '`'.str_replace('`', '``', $conn->getDatabaseName()).'`';
            foreach ($this->mutable as $tbl) {
                DB::unprepared("GRANT UPDATE, DELETE ON {$db}.`{$tbl}` TO {$account}");
            }
        }
    }

    public function down(): void
    {
        foreach ($this->immutable as $tbl) {
            foreach (['update', 'delete'] as $act) {
                DB::unprepared("DROP TRIGGER IF EXISTS tr_{$tbl}_no_{$act}");
            }
        }
        foreach (array_reverse([...$this->mutable, ...$this->immutable]) as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }
};
