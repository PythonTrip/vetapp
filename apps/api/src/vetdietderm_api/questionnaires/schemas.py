from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class VisitType(StrEnum):
    primary = "primary"
    secondary = "secondary"
    consultation = "consultation"
    supervision = "supervision"


class QuestionKind(StrEnum):
    binary = "binary"
    single_select = "single_select"
    multi_select = "multi_select"
    number = "number"
    text = "text"
    date = "date"


class QuestionOption(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    value: str = Field(min_length=1)
    label: str = Field(min_length=1)


class QuestionWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, from_attributes=True)
    kind: QuestionKind
    label: str = Field(min_length=1, max_length=500)
    options: list[QuestionOption] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_options(self) -> "QuestionWrite":
        if self.kind in {QuestionKind.single_select, QuestionKind.multi_select}:
            if len(self.options) < 2:
                raise ValueError("Укажите хотя бы два варианта ответа")
            if len({option.value for option in self.options}) != len(self.options):
                raise ValueError("Значения вариантов ответа должны различаться")
        elif self.options:
            raise ValueError("Этот тип вопроса не допускает варианты ответа")
        return self


class QuestionnaireWrite(BaseModel):
    questions: list[QuestionWrite]


class QuestionRead(QuestionWrite):
    uuid: UUID
    position: int


class QuestionnaireRead(BaseModel):
    uuid: UUID
    visit_type: VisitType
    updated_at: datetime
    questions: list[QuestionRead]
