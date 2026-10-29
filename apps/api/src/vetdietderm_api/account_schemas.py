"""Consumer-visible contracts for the existing module-auth BFF read endpoints."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class OrganizationProfile(BaseModel):
    model_config = ConfigDict(extra="allow")
    org_id: str
    name: str
    org_role: Literal["owner", "admin", "member", "viewer"]
    status: str


class UserProfileRead(BaseModel):
    model_config = ConfigDict(extra="allow")
    user_id: str
    email: str
    display_name: str | None = None
    role: str = "user"
    organization: OrganizationProfile | None = None


class OrganizationMemberRead(BaseModel):
    model_config = ConfigDict(extra="allow")
    user_id: str
    email: str
    display_name: str | None = None
    org_role: str


class OrganizationInviteRead(BaseModel):
    model_config = ConfigDict(extra="allow")
    invite_id: str
    email: str
    org_role: str


class OrganizationMembersRead(BaseModel):
    model_config = ConfigDict(extra="allow")
    members: list[OrganizationMemberRead]


class OrganizationInvitesRead(BaseModel):
    model_config = ConfigDict(extra="allow")
    invites: list[OrganizationInviteRead]
