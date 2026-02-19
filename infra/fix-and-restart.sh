#!/bin/bash
cd /Users/sommanutketpong/Documents/GitHub/project-cfo-poc-4/infra
cat fix-projections-schema.sql | docker compose exec -T db psql -U postgres -d admin_tenant_db
echo "Schema update completed"
docker compose restart backend
echo "Backend restarted"
