from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator
from vetdietderm_api.patients.schemas import Sex, Species


class OwnerProfileWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=255)
    phone: str = Field(min_length=1, max_length=64)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.strip().lower()
        if value.count("@") != 1 or any(c.isspace() for c in value) or not all(value.split("@")):
            raise ValueError("Укажите корректную электронную почту")
        return value


class OwnerRegister(OwnerProfileWrite):
    code: str = Field(min_length=1, max_length=64)
    # Do not strip passwords, including leading/trailing spaces.
    password: str = Field(min_length=15, max_length=128)

    @field_validator("password", mode="wrap")
    @classmethod
    def preserve_password(cls, value, handler):
        if not isinstance(value, str) or not 15 <= len(value) <= 128:
            raise ValueError("Пароль должен содержать от 15 до 128 символов")
        return value


class OwnerLogin(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=128)


class DoctorPreview(BaseModel):
    doctor_name: str
    organization_name: str | None


class CurrentJoinCode(DoctorPreview):
    code: str
    link: str


class OwnerRead(DoctorPreview):
    uuid: UUID
    name: str
    email: str
    phone: str
    linked: bool


class AnimalCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    name: str = Field(min_length=1, max_length=255)
    species: Species
    breed: str = Field(default="", max_length=255)
    sex: Sex = Sex.unspecified
    birth_date: date | None = None


class AnimalUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
    name: str | None = Field(default=None, min_length=1, max_length=255)
    species: Species | None = None
    breed: str | None = Field(default=None, max_length=255)
    sex: Sex | None = None
    birth_date: date | None = None

    @field_validator("name", "species", "breed", "sex", mode="before")
    @classmethod
    def reject_null(cls, value):
        if value is None:
            raise ValueError("Поле не может быть пустым")
        return value


class AnimalRead(AnimalCreate):
    model_config = ConfigDict(from_attributes=True)
    uuid: UUID


class AnimalMatch(BaseModel):
    owner_animal_id: UUID
    patient_uuid: UUID | None = None


class RegistrationAccept(BaseModel):
    mode: Literal["create", "link"]
    client_uuid: UUID | None = None
    matches: list[AnimalMatch] = Field(default_factory=list)


class RegistrationRead(BaseModel):
    uuid: UUID
    name: str
    email: str
    phone: str
    doctor_name: str
    organization_name: str | None
    can_accept: bool
    animals: list[AnimalRead]


class RegistrationAccepted(BaseModel):
    uuid: UUID
    client_uuid: UUID
    status: Literal["accepted"]
