from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str  # postgresql://user:pass@host:port/db
    jwt_secret: str
    smtp_dev_api_key: str
    admin_seed_username: str = "admin"
    admin_seed_password: str = "admin"
    jwt_algorithm: str = "HS256"
    admin_jwt_expire_days: int = 7
    portal_jwt_expire_hours: int = 24

    model_config = {"env_file": ".env"}


settings = Settings()
