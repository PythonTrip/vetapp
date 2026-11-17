"""Message writes persist the thread, message and file links together."""

from sqlalchemy.orm import Session

from vetdietderm_api.chat import repository
from vetdietderm_api.chat.repository import ChatTarget
from vetdietderm_api.chat.schemas import MessageCreate, MessageRead
from vetdietderm_api.owners.models import OwnerAccount


def send_message(
    db: Session,
    target: ChatTarget,
    payload: MessageCreate,
    *,
    owner: OwnerAccount | None = None,
    user: dict | None = None,
) -> MessageRead:
    message = repository.add_message(db, target, payload, owner=owner, user=user)
    db.commit()
    return message
