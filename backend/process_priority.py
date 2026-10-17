"""Run at the priorities an interactive start gets, not a scheduled task's.

Task Scheduler starts the nightly scripts at task priority 7, which Microsoft's table maps to
below-normal CPU, low I/O and low memory priority. Low memory priority means Windows takes
this process's pages first whenever anything else wants memory: on 17 Oct 2026 NE's scoring
held 9.9 GB but kept 1.4 GB in RAM, faulted 150,000 pages a second and ran 5 hours instead
of 20 minutes. A process may set its own priorities back to normal, so this leaves the
launchers alone. Windows only; a no-op elsewhere.
"""
from __future__ import annotations

import ctypes
import sys

NORMAL_PRIORITY_CLASS, BELOW_NORMAL_PRIORITY_CLASS = 0x20, 0x4000
_MEMORY, _THROTTLING, _IO = 0, 4, 33  # ProcessMemoryPriority, ProcessPowerThrottling, ProcessIoPriority
_EXECUTION_SPEED = 0x1                # PROCESS_POWER_THROTTLING_EXECUTION_SPEED: EcoQoS


class _Memory(ctypes.Structure):
    _fields_ = [("MemoryPriority", ctypes.c_ulong)]


class _Throttling(ctypes.Structure):
    _fields_ = [("Version", ctypes.c_ulong), ("ControlMask", ctypes.c_ulong), ("StateMask", ctypes.c_ulong)]


def _apis():
    from ctypes import wintypes as w
    kernel, nt = ctypes.WinDLL("kernel32", use_last_error=True), ctypes.WinDLL("ntdll")
    kernel.GetCurrentProcess.restype = w.HANDLE
    for f in (kernel.GetProcessInformation, kernel.SetProcessInformation):
        f.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD]
    kernel.SetPriorityClass.argtypes = [w.HANDLE, w.DWORD]
    kernel.GetPriorityClass.argtypes = [w.HANDLE]
    nt.NtSetInformationProcess.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.ULONG]
    nt.NtQueryInformationProcess.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.ULONG, ctypes.c_void_p]
    return kernel, nt, kernel.GetCurrentProcess()


def set_priorities(cpu_class, memory, io, eco):
    """This process's CPU class, memory priority (5 normal), I/O priority (2 normal) and
    EcoQoS on or off. Returns how many of the four Windows accepted."""
    kernel, nt, me = _apis()
    throttling = _Throttling(1, _EXECUTION_SPEED, _EXECUTION_SPEED if eco else 0)
    return sum([
        bool(kernel.SetPriorityClass(me, cpu_class)),
        bool(kernel.SetProcessInformation(me, _MEMORY, ctypes.byref(_Memory(memory)), ctypes.sizeof(_Memory))),
        nt.NtSetInformationProcess(me, _IO, ctypes.byref(ctypes.c_ulong(io)), 4) == 0,
        bool(kernel.SetProcessInformation(me, _THROTTLING, ctypes.byref(throttling), ctypes.sizeof(throttling))),
    ])


def current():
    """This process's priorities, as set_priorities takes them."""
    kernel, nt, me = _apis()
    memory, io, throttling = _Memory(), ctypes.c_ulong(), _Throttling(1, 0, 0)
    kernel.GetProcessInformation(me, _MEMORY, ctypes.byref(memory), ctypes.sizeof(memory))
    nt.NtQueryInformationProcess(me, _IO, ctypes.byref(io), 4, None)
    kernel.GetProcessInformation(me, _THROTTLING, ctypes.byref(throttling), ctypes.sizeof(throttling))
    return {"class": kernel.GetPriorityClass(me), "memory": memory.MemoryPriority, "io": io.value,
            "eco": bool(throttling.StateMask & _EXECUTION_SPEED)}


def normal_priority():
    """Normal CPU, memory and I/O priority and no EcoQoS for this process, whatever started it."""
    if sys.platform != "win32":
        return
    try:
        before = current()
        accepted = set_priorities(NORMAL_PRIORITY_CLASS, memory=5, io=2, eco=False)
        print(f"Process priority: was {before}, now {current()} ({accepted}/4 accepted)")
    except Exception as e:  # noqa: BLE001  a lower priority is slow, never a reason to stop
        print(f"[warn] could not raise process priority: {e!r}")
