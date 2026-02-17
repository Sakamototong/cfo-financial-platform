#!/usr/bin/env python3
"""Comprehensive API test for CFO Platform"""
import urllib.request, urllib.error, json, sys, os

TOKEN = os.environ.get("TOKEN", "demo-token-12345")

endpoints = [
    ("GET", "/auth/me"),
    ("GET", "/financial/statements"),
    ("GET", "/scenarios"),
    ("GET", "/projections/list"),
    ("GET", "/reports/summary?tenant_id=admin"),
    ("GET", "/reports/variance?tenant_id=admin"),
    ("GET", "/reports/trend?tenant_id=admin&line_code=REV001"),
    ("GET", "/etl/import/history"),
    ("GET", "/dim/dimensions"),
    ("GET", "/dim/templates"),
    ("GET", "/admin/config"),
    ("GET", "/admin/etl-params"),
    ("GET", "/admin/approvals"),
    ("GET", "/admin/audit"),
    ("GET", "/workflow/chains"),
    ("GET", "/workflow/requests"),
    ("GET", "/workflow/notifications"),
    ("GET", "/users"),
    ("GET", "/users/profile/me"),
    ("GET", "/users/transfer-ownership/pending"),
    ("GET", "/users/transfer-ownership/all"),
    ("GET", "/users/company/profile"),
    ("GET", "/users/invitations"),
    ("GET", "/tenant"),
    ("GET", "/tenants"),
    ("GET", "/super-admin/tenants"),
    ("GET", "/super-admin/analytics/overview"),
    ("GET", "/super-admin/me"),
]

ok = 0
fail = 0
for method, path in endpoints:
    url = f"http://localhost:3000{path}"
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("x-tenant-id", "admin")
    try:
        resp = urllib.request.urlopen(req)
        print(f"  OK {resp.status} {method} {path}")
        ok += 1
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode()[:100]
        except:
            pass
        print(f"  FAIL {e.code} {method} {path} -- {body}")
        fail += 1
    except Exception as e:
        print(f"  ERR {method} {path}: {e}")
        fail += 1

print(f"\nResults: {ok} OK, {fail} FAIL out of {ok+fail} endpoints")
