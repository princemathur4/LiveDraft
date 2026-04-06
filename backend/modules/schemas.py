from pydantic import BaseModel
from datetime import datetime
from typing import Optional


# ── Auth ─────────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    username: str
    email: str
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    username: str
    email: str

    class Config:
        from_attributes = True


# ── Pages ─────────────────────────────────────────────────────────────────────
class PageCreate(BaseModel):
    title: str
    body: str = ""
    parent_id: Optional[int] = None  # null = root page, int = child of that page


class PageUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    parent_id: Optional[int] = None


class PageOut(BaseModel):
    id: int
    title: str
    slug: str
    body: str
    parent_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    last_editor: Optional[UserOut]
    creator: Optional[UserOut]

    class Config:
        from_attributes = True


class PageSearchResult(BaseModel):
    title: str
    slug: str
    snippet: str


# ── Page tree (for sidebar) ───────────────────────────────────────────────────
# This is a recursive schema. Each node in the tree has:
#   id, title, slug, parent_id
#   children: list of the same shape (nested recursively)
#
# The API returns only root pages at the top level.
# Each root page contains its children, each child contains its children, etc.
#
# Example response from GET /pages/tree:
# [
#   {
#     "id": 1, "title": "Engineering", "slug": "engineering", "parent_id": null,
#     "children": [
#       {
#         "id": 2, "title": "Backend", "slug": "backend", "parent_id": 1,
#         "children": [
#           { "id": 4, "title": "API Design", "slug": "api-design", "parent_id": 2, "children": [] }
#         ]
#       },
#       {
#         "id": 3, "title": "Frontend", "slug": "frontend", "parent_id": 1,
#         "children": []
#       }
#     ]
#   }
# ]

class PageTreeNode(BaseModel):
    id: int
    title: str
    slug: str
    parent_id: Optional[int]
    children: list["PageTreeNode"] = []

    class Config:
        from_attributes = True


# Required to resolve the self-reference above
PageTreeNode.model_rebuild()
