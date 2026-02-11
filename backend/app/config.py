from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str  # https://bnwrxaljswtfubyhfotn.supabase.co
    supabase_service_key: str  # service_role JWT
    jwt_secret: str
    smtp_dev_api_key: str
    admin_seed_username: str = "admin"
    admin_seed_password: str = "admin"
    jwt_algorithm: str = "HS256"
    admin_jwt_expire_days: int = 7
    portal_jwt_expire_hours: int = 24
    refresh_token_expire_days: int = 30
    # Synthetic API (OpenAI-compatible) for AI email analysis
    synthetic_api_key: str = ""
    synthetic_api_base: str = "https://api.synthicai.com/v1"
    synthetic_model: str = "glm-4-7b"
    sync_interval_seconds: int = 300  # 5 minutes

    @field_validator("jwt_secret")
    @classmethod
    def jwt_secret_min_length(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("jwt_secret must be at least 32 characters")
        return v

    model_config = {"env_file": ".env"}


settings = Settings()
