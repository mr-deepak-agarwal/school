import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

app = FastAPI()

# Tighten allow_origins to your deployed Next.js URL before going live.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# service_role bypasses RLS entirely — this client must only ever live on the server.
admin_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


class NewTeacher(BaseModel):
    email: str
    password: str
    name: str
    teacher_code: str
    role: str = "teacher"
    subjects: List[str] = []


def require_admin(authorization: Optional[str]) -> str:
    """Confirm the caller's Supabase session belongs to an admin teacher."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    token = authorization.split(" ", 1)[1]

    user_resp = admin_client.auth.get_user(token)
    if not user_resp or not user_resp.user:
        raise HTTPException(401, "Invalid token")
    caller_id = user_resp.user.id

    row = (
        admin_client.table("teachers")
        .select("role")
        .eq("id", caller_id)
        .single()
        .execute()
    )
    if not row.data or row.data["role"] != "admin":
        raise HTTPException(403, "Admin only")

    return caller_id


@app.post("/admin/teachers")
def create_teacher(payload: NewTeacher, authorization: Optional[str] = Header(None)):
    require_admin(authorization)

    created = admin_client.auth.admin.create_user(
        {
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
        }
    )
    new_id = created.user.id

    admin_client.table("teachers").insert(
        {
            "id": new_id,
            "teacher_code": payload.teacher_code,
            "name": payload.name,
            "email": payload.email,
            "role": payload.role,
            "subjects": payload.subjects,
        }
    ).execute()

    return {"id": new_id}
