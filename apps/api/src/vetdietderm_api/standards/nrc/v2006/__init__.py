"""NRC 2006 edition. Assessment stays unavailable until normative_data.json is loaded."""

from vetdietderm_api.standards.nrc.v2006.edition import catalog_entry
from vetdietderm_api.standards.nrc.v2006.provider import load_provider

__all__ = ["catalog_entry", "load_provider"]
