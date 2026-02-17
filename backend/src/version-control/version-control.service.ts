import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CreateVersionDto, RestoreVersionDto, CompareVersionsDto, UpdatePolicyDto } from './dto/version.dto';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class VersionControlService {
  constructor(
    private readonly db: DatabaseService,
  ) {}

  /**
   * Get version history for a specific object
   */
  async getVersionHistory(
    tenantId: string,
    objectType: string,
    objectId: string,
    limit = 50,
  ) {
    const query = `
      SELECT 
        v.id,
        v.version_number,
        v.version_label,
        v.change_type,
        v.change_summary,
        v.changed_fields,
        v.created_by,
        v.created_at,
        v.snapshot_data
      FROM object_versions v
      WHERE v.tenant_id = $1
        AND v.object_type = $2
        AND v.object_id = $3
      ORDER BY v.version_number DESC
      LIMIT $4
    `;

    const versions = await this.db.query(query, [
      tenantId,
      objectType,
      objectId,
      limit,
    ]);

    return versions.rows;
  }

  /**
   * Get all versions for a tenant grouped by object
   */
  async getAllVersions(
    tenantId: string,
    objectType?: string,
    limit = 100,
  ) {
    let query = `
      SELECT 
        v.id,
        v.object_type,
        v.object_id,
        v.version_number,
        v.version_label,
        v.change_type,
        v.created_by,
        v.created_at,
        CASE v.object_type
          WHEN 'coa_entry' THEN v.snapshot_data->>'account_code'
          WHEN 'budget' THEN v.snapshot_data->>'budget_name'
          WHEN 'budget_line' THEN v.snapshot_data->>'line_code'
          WHEN 'statement' THEN v.snapshot_data->>'statement_name'
          WHEN 'scenario' THEN v.snapshot_data->>'name'
          WHEN 'cash_flow_forecast' THEN v.snapshot_data->>'forecast_name'
        END as object_name
      FROM object_versions v
      WHERE v.tenant_id = $1
    `;

    const params: any[] = [tenantId];

    if (objectType) {
      query += ` AND v.object_type = $2`;
      params.push(objectType);
      query += ` ORDER BY v.created_at DESC LIMIT $3`;
      params.push(limit);
    } else {
      query += ` ORDER BY v.created_at DESC LIMIT $2`;
      params.push(limit);
    }

    const versions = await this.db.query(query, params);
    return versions.rows;
  }

  /**
   * Get a specific version by version number
   */
  async getVersion(
    tenantId: string,
    objectType: string,
    objectId: string,
    versionNumber: number,
  ) {
    const query = `
      SELECT *
      FROM object_versions
      WHERE tenant_id = $1
        AND object_type = $2
        AND object_id = $3
        AND version_number = $4
    `;

    const result = await this.db.query(query, [
      tenantId,
      objectType,
      objectId,
      versionNumber,
    ]);

    if (result.rows.length === 0) {
      throw new NotFoundException(
        `Version ${versionNumber} not found for object ${objectId}`,
      );
    }

    return result.rows[0];
  }

  /**
   * Manually create a version snapshot
   */
  async createVersion(
    tenantId: string,
    dto: CreateVersionDto,
    createdBy: string,
  ) {
    // Get next version number
    const versionQuery = `
      SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
      FROM object_versions
      WHERE tenant_id = $1
        AND object_type = $2
        AND object_id = $3
    `;

    const versionResult = await this.db.query(versionQuery, [
      tenantId,
      dto.object_type,
      dto.object_id,
    ]);

    const nextVersion = versionResult.rows[0].next_version;

    // Insert version
    const insertQuery = `
      INSERT INTO object_versions (
        tenant_id,
        object_type,
        object_id,
        version_number,
        version_label,
        snapshot_data,
        change_type,
        change_summary,
        changed_fields,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await this.db.query(insertQuery, [
      tenantId,
      dto.object_type,
      dto.object_id,
      nextVersion,
      dto.version_label,
      JSON.stringify(dto.snapshot_data),
      dto.change_type,
      dto.change_summary,
      dto.changed_fields ? JSON.stringify(dto.changed_fields) : null,
      createdBy,
    ]);

    return result.rows[0];
  }

  /**
   * Compare two versions and return differences
   */
  async compareVersions(
    tenantId: string,
    objectType: string,
    objectId: string,
    dto: CompareVersionsDto,
    createdBy?: string,
  ) {
    // Get both versions
    const version1 = await this.getVersion(
      tenantId,
      objectType,
      objectId,
      dto.version_from,
    );
    const version2 = await this.getVersion(
      tenantId,
      objectType,
      objectId,
      dto.version_to,
    );

    // Compare snapshots
    const diff = this.calculateDiff(
      version1.snapshot_data,
      version2.snapshot_data,
    );

    const comparison = {
      version_from: dto.version_from,
      version_to: dto.version_to,
      version_from_date: version1.created_at,
      version_to_date: version2.created_at,
      differences: diff,
      summary: {
        fields_changed: diff.length,
        changes_by_field: diff.map((d) => d.field),
      },
    };

    // Save comparison if requested
    if (dto.save_comparison && createdBy) {
      const saveQuery = `
        INSERT INTO version_comparisons (
          tenant_id,
          object_type,
          object_id,
          version_from,
          version_to,
          comparison_result,
          created_by,
          notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

      await this.db.query(saveQuery, [
        tenantId,
        objectType,
        objectId,
        dto.version_from,
        dto.version_to,
        JSON.stringify(comparison),
        createdBy,
        dto.notes,
      ]);
    }

    return comparison;
  }

  /**
   * Restore an object to a specific version
   * Returns the snapshot data that should be applied
   */
  async restoreVersion(
    tenantId: string,
    objectType: string,
    objectId: string,
    dto: RestoreVersionDto,
  ) {
    const version = await this.getVersion(
      tenantId,
      objectType,
      objectId,
      dto.version_number,
    );

    return {
      restored_data: version.snapshot_data,
      restored_from_version: dto.version_number,
      restored_from_date: version.created_at,
      note: dto.restore_note,
    };
  }

  /**
   * Get version policy for an object type
   */
  async getPolicy(tenantId: string, objectType: string) {
    const query = `
      SELECT *
      FROM version_policies
      WHERE tenant_id = $1
        AND object_type = $2
    `;

    const result = await this.db.query(query, [tenantId, objectType]);

    if (result.rows.length === 0) {
      // Return default policy if not found
      return {
        tenant_id: tenantId,
        object_type: objectType,
        is_enabled: true,
        auto_snapshot_on_create: true,
        auto_snapshot_on_update: true,
        auto_snapshot_on_delete: true,
        max_versions_per_object: 50,
        retention_days: null,
      };
    }

    return result.rows[0];
  }

  /**
   * Update version policy
   */
  async updatePolicy(
    tenantId: string,
    objectType: string,
    dto: UpdatePolicyDto,
  ) {
    // Check if policy exists
    const existing = await this.db.query(
      'SELECT id FROM version_policies WHERE tenant_id = $1 AND object_type = $2',
      [tenantId, objectType],
    );

    if (existing.rows.length === 0) {
      // Insert new policy
      const insertQuery = `
        INSERT INTO version_policies (
          tenant_id,
          object_type,
          is_enabled,
          auto_snapshot_on_create,
          auto_snapshot_on_update,
          auto_snapshot_on_delete,
          max_versions_per_object,
          retention_days
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const result = await this.db.query(insertQuery, [
        tenantId,
        objectType,
        dto.is_enabled ?? true,
        dto.auto_snapshot_on_create ?? true,
        dto.auto_snapshot_on_update ?? true,
        dto.auto_snapshot_on_delete ?? true,
        dto.max_versions_per_object ?? 50,
        dto.retention_days ?? null,
      ]);

      return result.rows[0];
    } else {
      // Update existing policy
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (dto.is_enabled !== undefined) {
        fields.push(`is_enabled = $${idx++}`);
        values.push(dto.is_enabled);
      }
      if (dto.auto_snapshot_on_create !== undefined) {
        fields.push(`auto_snapshot_on_create = $${idx++}`);
        values.push(dto.auto_snapshot_on_create);
      }
      if (dto.auto_snapshot_on_update !== undefined) {
        fields.push(`auto_snapshot_on_update = $${idx++}`);
        values.push(dto.auto_snapshot_on_update);
      }
      if (dto.auto_snapshot_on_delete !== undefined) {
        fields.push(`auto_snapshot_on_delete = $${idx++}`);
        values.push(dto.auto_snapshot_on_delete);
      }
      if (dto.max_versions_per_object !== undefined) {
        fields.push(`max_versions_per_object = $${idx++}`);
        values.push(dto.max_versions_per_object);
      }
      if (dto.retention_days !== undefined) {
        fields.push(`retention_days = $${idx++}`);
        values.push(dto.retention_days);
      }

      fields.push(`updated_at = NOW()`);

      values.push(tenantId, objectType);

      const updateQuery = `
        UPDATE version_policies
        SET ${fields.join(', ')}
        WHERE tenant_id = $${idx++}
          AND object_type = $${idx++}
        RETURNING *
      `;

      const result = await this.db.query(updateQuery, values);
      return result.rows[0];
    }
  }

  /**
   * Clean up old versions based on retention policy
   */
  async cleanupOldVersions(tenantId: string, objectType: string) {
    const policy = await this.getPolicy(tenantId, objectType);

    if (!policy.retention_days) {
      return { deleted: 0, message: 'No retention policy set' };
    }

    const deleteQuery = `
      DELETE FROM object_versions
      WHERE tenant_id = $1
        AND object_type = $2
        AND created_at < NOW() - INTERVAL '1 day' * $3
    `;

    const result = await this.db.query(deleteQuery, [
      tenantId,
      objectType,
      policy.retention_days,
    ]);

    return {
      deleted: result.rowCount, // rowCount
      retention_days: policy.retention_days,
    };
  }

  /**
   * Calculate differences between two objects
   */
  private calculateDiff(obj1: any, obj2: any): any[] {
    const differences: any[] = [];

    // Get all unique keys
    const allKeys = new Set([
      ...Object.keys(obj1 || {}),
      ...Object.keys(obj2 || {}),
    ]);

    for (const key of allKeys) {
      const val1 = obj1?.[key];
      const val2 = obj2?.[key];

      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        differences.push({
          field: key,
          old_value: val1,
          new_value: val2,
          change_type: !val1 ? 'added' : !val2 ? 'removed' : 'modified',
        });
      }
    }

    return differences;
  }

  /**
   * Get version statistics for dashboard
   */
  async getVersionStats(tenantId: string) {
    const query = `
      SELECT 
        object_type,
        COUNT(*) as total_versions,
        COUNT(DISTINCT object_id) as unique_objects,
        MAX(created_at) as last_snapshot,
        COUNT(CASE WHEN change_type = 'create' THEN 1 END) as creates,
        COUNT(CASE WHEN change_type = 'update' THEN 1 END) as updates,
        COUNT(CASE WHEN change_type = 'delete' THEN 1 END) as deletes,
        COUNT(CASE WHEN change_type = 'restore' THEN 1 END) as restores
      FROM object_versions
      WHERE tenant_id = $1
      GROUP BY object_type
      ORDER BY total_versions DESC
    `;

    const stats = await this.db.query(query, [tenantId]);
    return stats.rows;
  }
}
