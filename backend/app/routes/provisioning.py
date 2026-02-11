"""Customer provisioning routes."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_admin
from app.services.provisioner import provision_customer

router = APIRouter()


class ProvisionRequest(BaseModel):
    first_name: str
    middle_name: str | None = None
    last_name: str
    date_of_birth: str | None = None  # YYYY-MM-DD
    phone: str | None = None


@router.post("/provision")
async def provision(body: ProvisionRequest, payload: dict = Depends(require_admin)):
    """Provision a new customer (SMTP account + DB + portal user)."""
    # Auto-generate email: firstname + lastname @ dasherhelp.com
    import re
    first = re.sub(r'[^a-z]', '', body.first_name.lower().strip())
    last = re.sub(r'[^a-z]', '', body.last_name.lower().strip())
    if not first or not last:
        raise HTTPException(status_code=400, detail="First name and last name are required")
    email = f"{first}{last}@dasherhelp.com"
    customer_name = f"{body.first_name.strip()} {body.last_name.strip()}"

    try:
        result = await provision_customer(
            email=email,
            customer_name=customer_name,
            first_name=body.first_name.strip(),
            middle_name=body.middle_name.strip() if body.middle_name else None,
            last_name=body.last_name.strip(),
            date_of_birth=body.date_of_birth,
            phone=body.phone,
            admin_id=payload.get("admin_id"),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Provisioning failed: {str(e)}")
