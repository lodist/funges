"""A scheduled task's low priorities, put back to normal by the process itself."""
import sys

import pytest

import process_priority as pp

pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows process priorities")


def test_normal_priority_undoes_a_scheduled_tasks_low_priorities():
    # How task priority 7 starts the nightly scripts: below-normal CPU, memory priority low,
    # I/O low; plus EcoQoS, which Windows gives low-priority background work.
    pp.set_priorities(pp.BELOW_NORMAL_PRIORITY_CLASS, memory=2, io=1, eco=True)
    assert pp.current() == {"class": pp.BELOW_NORMAL_PRIORITY_CLASS, "memory": 2, "io": 1, "eco": True}
    pp.normal_priority()
    assert pp.current() == {"class": pp.NORMAL_PRIORITY_CLASS, "memory": 5, "io": 2, "eco": False}
