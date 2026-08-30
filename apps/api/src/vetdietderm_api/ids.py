from uuid import UUID, uuid1


def uuid6() -> UUID:
    """RFC 9562 UUID version 6, derived from a UUID v1 timestamp."""
    value = uuid1()
    timestamp = value.time
    time_high = (timestamp >> 28) & 0xFFFFFFFF
    time_mid = (timestamp >> 12) & 0xFFFF
    time_low = timestamp & 0x0FFF
    clock_seq = value.clock_seq & 0x3FFF
    node = value.node & 0xFFFFFFFFFFFF
    int_value = (
        (time_high << 96)
        | (time_mid << 80)
        | (0x6 << 76)
        | (time_low << 64)
        | ((0x80 | ((clock_seq >> 8) & 0x3F)) << 56)
        | ((clock_seq & 0xFF) << 48)
        | node
    )
    return UUID(int=int_value)
