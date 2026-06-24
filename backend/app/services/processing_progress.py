"""Thread-safe in-memory progress for long-running PDF processing jobs."""

from __future__ import annotations

import threading
from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class ProcessProgressState:
    active: bool = False
    total: int = 0
    completed: int = 0
    percent: int = 0
    stage: str = "idle"
    message: str = ""
    current_file: str = ""


class ProcessingProgressTracker:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = ProcessProgressState()

    def start(self, total: int) -> None:
        with self._lock:
            self._state = ProcessProgressState(
                active=True,
                total=max(total, 0),
                completed=0,
                percent=0,
                stage="preparing",
                message="Preparing extraction…",
            )

    def update(
        self,
        *,
        stage: str | None = None,
        message: str | None = None,
        current_file: str | None = None,
        completed: int | None = None,
        page: int | None = None,
        page_total: int | None = None,
    ) -> None:
        with self._lock:
            if stage is not None:
                self._state.stage = stage
            if message is not None:
                self._state.message = message
            if current_file is not None:
                self._state.current_file = current_file
            if completed is not None:
                self._state.completed = completed

            total = self._state.total or 1
            done = self._state.completed
            percent = int((done / total) * 100)

            if page is not None and page_total and self._state.active:
                file_weight = 100 / total
                in_file = (page / page_total) * file_weight
                percent = min(99, int((done / total) * 100 + in_file))

            self._state.percent = min(99, max(0, percent))

    def complete_file(self) -> None:
        with self._lock:
            self._state.completed += 1
            total = self._state.total or 1
            self._state.percent = min(99, int((self._state.completed / total) * 100))
            self._state.message = f"Finished {self._state.completed} of {total} PDF(s)"

    def finish(self) -> None:
        with self._lock:
            self._state.active = False
            self._state.percent = 100
            self._state.stage = "done"
            self._state.message = "Processing complete"

    def reset(self) -> None:
        with self._lock:
            self._state = ProcessProgressState()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return asdict(self._state)


_tracker = ProcessingProgressTracker()


def get_processing_progress() -> ProcessingProgressTracker:
    return _tracker
