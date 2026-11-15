"""Request and response models.

The field names and the allowed values below mirror artifacts/feature_schema.json exactly.
At start-up, model_service.py double-checks this, so the two can never silently drift apart.
"""
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

YesNo = Literal["No", "Yes"]
YesNoNoInternet = Literal["No", "No internet service", "Yes"]
RiskLevel = Literal["Low", "Medium", "High"]

EXAMPLE_CUSTOMER = {
    "SeniorCitizen": 0, "tenure": 3, "MonthlyCharges": 95.5, "TotalCharges": 286.5,
    "gender": "Female", "Partner": "No", "Dependents": "No", "PhoneService": "Yes",
    "MultipleLines": "Yes", "InternetService": "Fiber optic", "OnlineSecurity": "No",
    "OnlineBackup": "No", "DeviceProtection": "No", "TechSupport": "No", "StreamingTV": "Yes",
    "StreamingMovies": "Yes", "Contract": "Month-to-month", "PaperlessBilling": "Yes",
    "PaymentMethod": "Electronic check",
}


class CustomerInput(BaseModel):
    """One customer, described with the exact column names the model was trained on."""

    model_config = ConfigDict(extra="forbid", json_schema_extra={"example": EXAMPLE_CUSTOMER})

    # --- numeric features ---
    SeniorCitizen: Literal[0, 1] = Field(description="1 if the customer is a senior citizen, otherwise 0")
    tenure: int = Field(ge=0, le=120, description="Months the customer has been with the company")
    MonthlyCharges: float = Field(gt=0, le=1000, allow_inf_nan=False, description="Current monthly bill")
    TotalCharges: Optional[float] = Field(
        default=None, ge=0, le=1_000_000, allow_inf_nan=False,
        description="Total billed so far. May be left out for brand-new customers (a typical value is used).",
    )

    # --- categorical features (allowed values come from feature_schema.json) ---
    gender: Literal["Female", "Male"]
    Partner: YesNo
    Dependents: YesNo
    PhoneService: YesNo
    MultipleLines: Literal["No", "No phone service", "Yes"]
    InternetService: Literal["DSL", "Fiber optic", "No"]
    OnlineSecurity: YesNoNoInternet
    OnlineBackup: YesNoNoInternet
    DeviceProtection: YesNoNoInternet
    TechSupport: YesNoNoInternet
    StreamingTV: YesNoNoInternet
    StreamingMovies: YesNoNoInternet
    Contract: Literal["Month-to-month", "One year", "Two year"]
    PaperlessBilling: YesNo
    PaymentMethod: Literal[
        "Bank transfer (automatic)", "Credit card (automatic)", "Electronic check", "Mailed check"
    ]


class ModelInfo(BaseModel):
    name: str
    trained_at_utc: Optional[str] = None
    scikit_learn_saved: Optional[str] = None
    scikit_learn_running: str
    class_weight: Optional[str] = None


class Driver(BaseModel):
    feature: str
    value: Any
    effect_points: float = Field(
        description="Percentage points this customer's value adds to (+) or removes from (-) the churn "
        "probability, compared with the typical training value for that one field."
    )


class PredictionResponse(BaseModel):
    churn_probability: float
    predicted_churn: bool
    risk_level: RiskLevel
    threshold: float
    risk_bands: dict[str, float]
    warnings: list[str]
    drivers: list[Driver]
    model: ModelInfo


class BatchRequest(BaseModel):
    customers: list[dict[str, Any]] = Field(min_length=1)


class BatchRowResult(BaseModel):
    row: int
    id: Optional[str] = None
    status: Literal["ok", "error"]
    churn_probability: Optional[float] = None
    predicted_churn: Optional[bool] = None
    risk_level: Optional[RiskLevel] = None
    warnings: list[str] = []
    errors: list[str] = []


class BatchResponse(BaseModel):
    count: int
    scored: int
    failed: int
    summary: dict[str, int]
    results: list[BatchRowResult]
    model: ModelInfo
