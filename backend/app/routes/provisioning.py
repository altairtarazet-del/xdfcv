"""Customer provisioning routes."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_admin
from app.services.provisioner import provision_customer

router = APIRouter()


class ProvisionRequest(BaseModel):
    email: str
    customer_name: str | None = None
    phone: str | None = None


@router.post("/provision")
async def provision(body: ProvisionRequest, payload: dict = Depends(require_admin)):
    """Provision a new customer (SMTP account + DB + portal user)."""
    try:
        result = await provision_customer(
            email=body.email,
            customer_name=body.customer_name,
            phone=body.phone,
            admin_id=payload.get("admin_id"),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Provisioning failed: {str(e)}")
