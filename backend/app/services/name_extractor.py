"""3-Tier Name Extraction Algorithm.

Tier 1: Email greeting extraction (most reliable)
Tier 2: Email local part split using extracted first name
Tier 3: Common US first name dictionary fallback
"""
import logging
import re

from app.services.smtp_client import SmtpDevClient

logger = logging.getLogger(__name__)

# Greeting patterns: capture the name after/before the keyword
_GREETING_PATTERNS = [
    # "Hi Name," / "Hi Name!" / "Hello Name," / "Dear Name,"
    re.compile(r"\b(?:Hi|Hello|Hey|Dear)\s+([A-Z][a-z]{1,20})[,!\.\s]", re.MULTILINE),
    # "Name, your" / "Name, start" / "Name, to complete" / "Name, we"
    re.compile(r"^([A-Z][a-z]{1,20}),\s+(?:your|start|to |we |you |this|the |please)", re.MULTILINE),
    # "Congratulations, Name" / "Welcome, Name" / "Thanks, Name"
    re.compile(r"\b(?:Congratulations|Welcome|Thanks|Thank you),?\s+([A-Z][a-z]{1,20})[,!\.\s]", re.MULTILINE),
]

# ~500 common US first names for Tier 3 fallback
COMMON_FIRST_NAMES = {
    "james", "robert", "john", "michael", "david", "william", "richard", "joseph",
    "thomas", "charles", "christopher", "daniel", "matthew", "anthony", "mark",
    "donald", "steven", "paul", "andrew", "joshua", "kenneth", "kevin", "brian",
    "george", "timothy", "ronald", "edward", "jason", "jeffrey", "ryan", "jacob",
    "gary", "nicholas", "eric", "jonathan", "stephen", "larry", "justin", "scott",
    "brandon", "benjamin", "samuel", "raymond", "gregory", "frank", "alexander",
    "patrick", "jack", "dennis", "jerry", "tyler", "aaron", "jose", "adam",
    "nathan", "henry", "peter", "zachary", "douglas", "harold", "kyle", "noah",
    "carl", "gerald", "keith", "roger", "arthur", "terry", "sean", "austin",
    "christian", "albert", "joe", "ethan", "jesse", "willie", "billy", "bruce",
    "ralph", "gabriel", "logan", "alan", "juan", "wayne", "elijah", "randy",
    "roy", "vincent", "eugene", "russell", "bobby", "mason", "philip", "harry",
    "mary", "patricia", "jennifer", "linda", "barbara", "elizabeth", "susan",
    "jessica", "sarah", "karen", "lisa", "nancy", "betty", "margaret", "sandra",
    "ashley", "dorothy", "kimberly", "emily", "donna", "michelle", "carol",
    "amanda", "melissa", "deborah", "stephanie", "rebecca", "sharon", "laura",
    "cynthia", "kathleen", "amy", "angela", "shirley", "anna", "brenda", "pamela",
    "emma", "nicole", "helen", "samantha", "katherine", "christine", "debra",
    "rachel", "carolyn", "janet", "catherine", "maria", "heather", "diane",
    "ruth", "julie", "olivia", "joyce", "virginia", "victoria", "kelly",
    "lauren", "christina", "joan", "evelyn", "judith", "megan", "andrea",
    "cheryl", "hannah", "jacqueline", "martha", "gloria", "teresa", "ann",
    "sara", "madison", "frances", "kathryn", "janice", "jean", "abigail",
    "alice", "judy", "sophia", "grace", "denise", "amber", "doris", "marilyn",
    "danielle", "beverly", "isabella", "theresa", "diana", "natalie", "brittany",
    "charlotte", "marie", "kayla", "alexis", "lori",
    # Common middle-eastern / south-asian names found in delivery apps
    "muhammad", "muhammet", "muhammed", "ahmed", "ahmet", "ali", "omar", "omer",
    "hassan", "hasan", "hussein", "huseyin", "ibrahim", "abdul", "abdulkadir",
    "mohammed", "mehmet", "mustafa", "yusuf", "khalid", "tariq", "arafat",
    "farhan", "imran", "raj", "sanjay", "vijay", "amit", "rahul", "suresh",
    "deepak", "arjun", "ravi", "krishna", "naveen", "anil", "pradeep",
    "carlos", "miguel", "luis", "jorge", "pedro", "ricardo", "rafael",
    "fernando", "alejandro", "diego", "sergio", "pablo", "andres", "antonio",
    "francisco", "manuel", "eduardo", "oscar", "mario", "hector", "ivan",
    "wei", "chen", "ming", "hong", "jin", "jing", "yong", "ling", "xiao",
    "zhang", "wang", "li", "liu", "yang",
    # Common Turkish first names
    "ozkan", "ozan", "ozcan", "ozgur", "delil", "deli", "serafettin",
    "ugurcan", "ugur", "halil", "zeynel", "ramazan", "erhan", "veysi",
    "selim", "emre", "emrah", "yasin", "hakan", "ferdi", "bilal",
    "volkan", "diyar", "sezer", "serkan", "nurgul", "ebru", "elif",
    "mervan", "oktay", "baran", "savas", "mahsum", "cemil", "selcuk",
    "mesut", "yunus", "hayrettin", "harun", "ilyas", "ferhat", "hakki",
    "veysel", "olcay", "poyraz", "hamza", "telman", "kutlu", "dino",
    "necati", "rohullah", "majd", "zokirzhon", "anna", "ana",
    "ercan", "kemal", "cemal", "recep", "suleyman", "ismail", "osman",
    "bekir", "fatih", "murat", "burak", "tolga", "sinan", "cengiz",
    "deniz", "baris", "levent", "gokhan", "tuncay", "orhan", "ayhan",
    "aydin", "erdal", "cihan", "engin", "serdar", "alper", "koray",
    "onur", "umut", "cem", "enes", "yavuz", "tarik", "kenan",
    "sefa", "taha", "furkan", "berkay", "kaan", "arda", "batuhan",
    "berke", "eren", "emir", "yigit", "alp", "bartu", "ege",
    "zeynep", "ayse", "fatma", "emine", "hatice", "merve", "busra",
    "esra", "kubra", "selin", "gamze", "irem", "tugba", "gizem",
    "derya", "sevgi", "gulsen", "yasemin", "pinar", "songul",
    # More common US names
    "dylan", "cole", "luke", "connor", "evan", "owen", "carter", "liam",
    "aiden", "landon", "jackson", "caleb", "jayden", "blake", "chase",
    "cameron", "dominic", "parker", "hunter", "cooper", "tristan", "derek",
    "marcus", "travis", "cody", "jake", "chad", "brett", "dane", "bryce",
    "tanner", "dalton", "colton", "devin", "riley", "taylor", "jordan",
    "morgan", "alex", "casey", "drew", "spencer", "grant", "trevor",
    "brooke", "paige", "morgan", "bailey", "haley", "mackenzie", "sydney",
    "chloe", "taylor", "savannah", "alyssa", "sierra", "autumn", "jade",
    "destiny", "crystal", "jasmine", "tiffany", "courtney", "vanessa",
    "bianca", "selena", "trinity", "breanna", "ariana", "adriana", "ivy",
    "zoe", "stella", "nora", "eleanor", "violet", "scarlett", "aurora",
    "skylar", "luna", "penelope", "layla", "addison", "brooklyn",
}


_GREETING_STOPWORDS = {
    "the", "this", "that", "your", "our", "all", "new", "just", "not", "but",
    "and", "for", "are", "was", "has", "had", "have", "been", "will", "can",
    "may", "did", "does", "get", "got", "let", "set", "see", "use", "try",
    # DoorDash / gig app specific false positives
    "dasher", "driver", "courier", "rider", "shopper", "walker", "runner",
    "kit", "app", "team", "help", "support", "order", "delivery", "account",
    "doordash", "grubhub", "ubereats", "instacart", "postmates", "spark", "gift",
    # Common email template words that can match greeting patterns
    "otherwise", "someone", "customer", "member", "friend", "user",
    "action", "update", "notice", "important", "reminder", "please",
    "here", "there", "where", "when", "what", "which", "more", "some",
    "next", "last", "first", "then", "now", "today",
}


def extract_name_from_greeting(text: str) -> str | None:
    """Tier 1: Extract first name from email greeting patterns."""
    if not text:
        return None
    for pattern in _GREETING_PATTERNS:
        match = pattern.search(text)
        if match:
            name = match.group(1)
            if name.lower() in _GREETING_STOPWORDS:
                continue
            return name
    return None


def _clean_name_part(s: str) -> str:
    """Strip trailing digits and repeated trailing chars from a name part."""
    # Strip trailing digits
    s = re.sub(r"\d+$", "", s).strip()
    # Strip trailing repeated char (e.g. "turelii" → "tureli")
    if len(s) >= 2 and s[-1] == s[-2]:
        s = s[:-1]
    return s


def _strip_boundary_dupes(remainder: str, boundary_char: str) -> str:
    """Strip duplicated boundary chars from start of remainder.

    Uses consonant cluster heuristic: if remainder starts with two consonants,
    the first is likely a duplicate (Turkish/most names don't start with consonant clusters).
    """
    _VOWELS = set("aeiou")
    extra_count = 0
    while extra_count < len(remainder) and remainder[extra_count] == boundary_char:
        extra_count += 1
    if extra_count >= 2:
        remainder = remainder[extra_count:]
    elif extra_count == 1 and len(remainder) >= 2:
        if remainder[0] not in _VOWELS and remainder[1] not in _VOWELS:
            remainder = remainder[1:]
    return remainder


def split_email_local_part(local_part: str, first_name: str) -> tuple[str, str]:
    """Tier 2: Split email local part using known first name.

    Example: local_part="muhammmetbayram", first_name="Muhammet"
    → ("Muhammet", "Bayram")
    """
    lower_local = local_part.lower().replace(".", "").replace("_", "").replace("-", "")
    lower_local_clean = re.sub(r"\d+$", "", lower_local)
    lower_first = first_name.lower()

    # Try exact prefix match
    if lower_local_clean.startswith(lower_first):
        remainder = lower_local_clean[len(lower_first):]
        if remainder:
            remainder = _strip_boundary_dupes(remainder, lower_first[-1])
            return first_name, _clean_name_part(remainder).capitalize()
        return first_name, ""

    # Try fuzzy prefix (allow extra repeated chars within the name, e.g. "muhammmet" vs "muhammet")
    i, j = 0, 0
    while i < len(lower_first) and j < len(lower_local_clean):
        if lower_first[i] == lower_local_clean[j]:
            i += 1
            j += 1
        elif j > 0 and lower_local_clean[j] == lower_local_clean[j - 1]:
            j += 1
        else:
            break

    if i == len(lower_first) and j < len(lower_local_clean):
        remainder = lower_local_clean[j:]
        if remainder:
            remainder = _strip_boundary_dupes(remainder, lower_first[-1])
            return first_name, _clean_name_part(remainder).capitalize()

    return first_name, ""


def extract_from_dictionary(local_part: str) -> tuple[str, str] | None:
    """Tier 3: Match longest known first name prefix from dictionary."""
    clean = local_part.lower().replace(".", "").replace("_", "").replace("-", "")
    # Strip trailing digits
    clean = re.sub(r"\d+$", "", clean)
    if not clean:
        return None

    best_name = None
    best_end = 0

    for name in COMMON_FIRST_NAMES:
        if len(name) < 3:
            continue
        if not clean.startswith(name):
            continue
        if len(name) > len(best_name or ""):
            best_name = name
            best_end = len(name)

    if not best_name:
        return None

    remainder = clean[best_end:]
    remainder = _strip_boundary_dupes(remainder, best_name[-1])

    first = best_name.capitalize()
    last = _clean_name_part(remainder).capitalize() if remainder else ""
    return first, last

    return None


async def extract_names_for_account(db, smtp_client: SmtpDevClient, account: dict) -> dict | None:
    """Main orchestrator: apply Tier 1 → 2 → 3 name extraction for a single account.

    Returns {"first_name": ..., "last_name": ...} or None if no extraction possible.
    """
    email = account.get("email", "")
    local_part = email.split("@")[0] if "@" in email else ""
    smtp_account_id = account.get("smtp_account_id")

    if not smtp_account_id or not local_part:
        return None

    # --- Tier 1: Greeting extraction from recent emails ---
    first_name = None
    try:
        smtp_data = await smtp_client.find_account_by_email(email)
        if smtp_data:
            inbox_id = smtp_data.get("inbox_id")
            if inbox_id:
                result = await smtp_client.get_messages(smtp_account_id, inbox_id, page=1, per_page=5)
                messages = result.get("data", [])
                for msg in messages:
                    # Try to get full message body
                    msg_path = msg.get("@id") or msg.get("id")
                    if not msg_path:
                        continue
                    full_msg = await smtp_client.get_message(str(msg_path))
                    if not full_msg:
                        continue
                    body = full_msg.get("text", "") or full_msg.get("html", "")
                    name = extract_name_from_greeting(body)
                    if name:
                        first_name = name
                        logger.info(f"Tier 1 match for {email}: greeting → {first_name}")
                        break
    except Exception as e:
        logger.warning(f"Tier 1 failed for {email}: {e}")

    # --- Tier 2: Split local part using extracted first name ---
    if first_name:
        first, last = split_email_local_part(local_part, first_name)
        if last:
            return {"first_name": first, "last_name": last}
        # Have first name but no last name from split
        return {"first_name": first, "last_name": ""}

    # --- Tier 3: Dictionary fallback ---
    dict_result = extract_from_dictionary(local_part)
    if dict_result:
        first, last = dict_result
        logger.info(f"Tier 3 match for {email}: dictionary → {first} {last}")
        return {"first_name": first, "last_name": last}

    logger.debug(f"No name extraction possible for {email}")
    return None
