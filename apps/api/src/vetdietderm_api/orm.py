"""Register runtime ORM models for both the API and Alembic."""


def load_models() -> None:
    from vetdietderm_api import auth_models  # noqa: F401
    from vetdietderm_api.appointments import models as appointment_models  # noqa: F401
    from vetdietderm_api.assessments import models as assessment_models  # noqa: F401
    from vetdietderm_api.attachments import models as attachment_models  # noqa: F401
    from vetdietderm_api.catalog import models as catalog_models  # noqa: F401
    from vetdietderm_api.chat import models as chat_models  # noqa: F401
    from vetdietderm_api.clinical_catalog import models as clinical_catalog_models  # noqa: F401
    from vetdietderm_api.communications import models as communication_models  # noqa: F401
    from vetdietderm_api.encounter_templates import models as encounter_template_models  # noqa: F401
    from vetdietderm_api.encounters import models as encounter_models  # noqa: F401
    from vetdietderm_api.owners import models as owner_models  # noqa: F401
    from vetdietderm_api.patients import models as patient_models  # noqa: F401
    from vetdietderm_api.questionnaires import models as questionnaire_models  # noqa: F401
    from vetdietderm_api.visits import models as visit_models  # noqa: F401
