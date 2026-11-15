from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schemas import BatchResponse, CustomerInput, PredictionResponse

UUID_PATTERN = r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"


class V1PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_id: Optional[str] = Field(default=None, max_length=100)
    customer: CustomerInput


class V1PredictResponse(PredictionResponse):
    prediction_id: Optional[str] = None
    saved: bool = False
    save_error: Optional[str] = None
    created_at: str


class V1BatchRequest(BaseModel):
    filename: str = Field(default="upload.csv", max_length=255)
    customers: list[dict[str, Any]] = Field(min_length=1)


class V1BatchResponse(BatchResponse):
    batch_id: Optional[str] = None
    saved: bool = False
    save_error: Optional[str] = None
    processing_ms: int = 0
    created_at: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=30)
    prediction_id: Optional[str] = Field(default=None, pattern=UUID_PATTERN)


class ChatResponse(BaseModel):
    reply: str
    provider: str
    model: str
    used_context: list[str]


class ReportRequest(BaseModel):
    kind: Literal["executive", "risk", "batch", "model", "segment"]
    batch_id: Optional[str] = Field(default=None, pattern=UUID_PATTERN)
    include_ai_summary: bool = False
