import argparse
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from vetdietderm_api.db import get_session_factory
from vetdietderm_api.guidelines.models import GuidelineEdition, GuidelineStandard


def _resolve_edition(session: Session, identifier: str) -> GuidelineEdition:
    standard = session.scalar(
        select(GuidelineStandard).where(GuidelineStandard.code == "fediaf")
    )
    if standard is None:
        raise ValueError("FEDIAF standard has not been imported")
    try:
        edition_uuid = UUID(identifier)
    except ValueError:
        edition_uuid = None
    if edition_uuid is not None:
        edition = session.scalar(
            select(GuidelineEdition).where(
                GuidelineEdition.uuid == edition_uuid,
                GuidelineEdition.standard_uuid == standard.uuid,
            )
        )
    else:
        edition = session.scalar(
            select(GuidelineEdition)
            .where(
                GuidelineEdition.standard_uuid == standard.uuid,
                GuidelineEdition.code == identifier,
                GuidelineEdition.status == "validated",
            )
            .order_by(GuidelineEdition.import_version.desc())
            .limit(1)
        )
    if edition is None:
        raise ValueError(f"FEDIAF edition {identifier!r} was not found in validated state")
    return edition


def publish_fediaf(session: Session, identifier: str) -> GuidelineEdition:
    edition = _resolve_edition(session, identifier)
    if edition.status != "validated":
        raise ValueError(
            f"Only a validated edition may be published; current status is {edition.status!r}"
        )
    now = datetime.now(timezone.utc)
    session.execute(
        update(GuidelineEdition)
        .where(
            GuidelineEdition.standard_uuid == edition.standard_uuid,
            GuidelineEdition.status == "published",
            GuidelineEdition.uuid != edition.uuid,
        )
        .values(status="retired", retired_at=now)
    )
    session.flush()
    edition.status = "published"
    edition.published_at = now
    edition.retired_at = None
    session.commit()
    session.refresh(edition)
    return edition


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish a validated FEDIAF edition")
    parser.add_argument("--edition", required=True, help="Edition code or UUID")
    args = parser.parse_args()
    session = get_session_factory()()
    try:
        edition = publish_fediaf(session, args.edition)
    except Exception as exc:
        session.rollback()
        print(f"FEDIAF publish failed: {exc}")
        raise SystemExit(1) from exc
    finally:
        session.close()
    print(
        f"Published FEDIAF edition {edition.code} "
        f"import_version={edition.import_version} uuid={edition.uuid}"
    )


if __name__ == "__main__":
    main()
