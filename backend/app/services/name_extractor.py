"""3-Tier Name Extraction Algorithm.

Tier 1: Email greeting extraction (most reliable)
Tier 2: Email local part split using extracted first name
Tier 3: Common first name dictionary fallback (with fuzzy matching)
"""
import asyncio
import difflib
import logging
import re

from app.services.smtp_client import SmtpDevClient
from app.utils import mask_email

logger = logging.getLogger(__name__)

# Greeting patterns: capture the name after/before the keyword
_GREETING_PATTERNS = [
    # English: "Hi Name," / "Hello Name," / "Dear Name,"
    re.compile(r"\b(?:Hi|Hello|Hey|Dear)\s+([A-Z\u00C0-\u024F][a-z\u00E0-\u024F]{1,20})\b", re.MULTILINE),
    # Turkish: "Merhaba Name," / "Sayın Name," / "Değerli Name," / "Sevgili Name,"
    re.compile(r"\b(?:Merhaba|Sayın|Değerli|Sevgili|Say\u0131n|De\u011ferli)\s+([A-Z\u00C0-\u024F][a-z\u00E0-\u024F]{1,20})\b", re.MULTILINE),
    # "Name, your" / "Name, start" / "Name, to complete" / "Name, we"
    re.compile(r"^([A-Z\u00C0-\u024F][a-z\u00E0-\u024F]{1,20}),\s+(?:your|start|to |we |you |this|the |please)", re.MULTILINE),
    # "Congratulations, Name" / "Welcome, Name" / "Thanks, Name"
    re.compile(r"\b(?:Congratulations|Welcome|Thanks|Thank you),?\s+([A-Z\u00C0-\u024F][a-z\u00E0-\u024F]{1,20})\b", re.MULTILINE),
    # Turkish: "Tebrikler Name" / "Hoşgeldin Name"
    re.compile(r"\b(?:Tebrikler|Ho\u015fgeldin|Hoşgeldin|Hoşgeldiniz)\s+([A-Z\u00C0-\u024F][a-z\u00E0-\u024F]{1,20})\b", re.MULTILINE),
]

# Known compound first names (multi-word)
_COMPOUND_FIRST_NAMES = {
    "muhammad ali", "mohammed ali", "abd el", "abdul rahman", "abdul kadir",
    "abdul halim", "abdul aziz", "abd allah", "jose maria", "josé maría",
    "anne marie", "mary jane", "mary ann", "jean paul", "jean pierre",
    "jean claude", "jean marc", "jean louis", "jean michel", "jean luc",
    "ahmet can", "mehmet ali", "mehmet can", "mustafa kemal", "ali riza",
    "ali osman", "haci mehmet", "haci ali", "haci mustafa",
    "fatma nur", "hatice nur", "ayse nur", "zeynep nur",
    "el amin", "el hassan", "al hassan", "al amin",
    "anna maria", "maria jose", "maria teresa", "maria elena",
    "sarah jane", "lily mae", "emma lee", "beth ann",
}

# ~500+ common first names for Tier 3 fallback
COMMON_FIRST_NAMES = {
    # Common US male names
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
    # Common US female names
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
    # More common US names
    "dylan", "cole", "luke", "connor", "evan", "owen", "carter", "liam",
    "aiden", "landon", "jackson", "caleb", "jayden", "blake", "chase",
    "cameron", "dominic", "parker", "hunter", "cooper", "tristan", "derek",
    "marcus", "travis", "cody", "jake", "chad", "brett", "dane", "bryce",
    "tanner", "dalton", "colton", "devin", "riley", "taylor", "jordan",
    "morgan", "alex", "casey", "drew", "spencer", "grant", "trevor",
    "brooke", "paige", "bailey", "haley", "mackenzie", "sydney",
    "chloe", "savannah", "alyssa", "sierra", "autumn", "jade",
    "destiny", "crystal", "jasmine", "tiffany", "courtney", "vanessa",
    "bianca", "selena", "trinity", "breanna", "ariana", "adriana", "ivy",
    "zoe", "stella", "nora", "eleanor", "violet", "scarlett", "aurora",
    "skylar", "luna", "penelope", "layla", "addison", "brooklyn",
    # --- Turkish male names (~120) ---
    "ahmet", "mehmet", "mustafa", "ali", "hasan", "huseyin", "ibrahim",
    "ismail", "yusuf", "osman", "murat", "halil", "omer", "hakan",
    "fatih", "emre", "burak", "serkan", "gokhan", "kemal", "cemal",
    "recep", "suleyman", "bekir", "selim", "tolga", "sinan", "cengiz",
    "deniz", "baris", "levent", "tuncay", "orhan", "ayhan", "volkan",
    "aydin", "erdal", "cihan", "engin", "serdar", "alper", "koray",
    "onur", "umut", "cem", "enes", "yavuz", "tarik", "kenan",
    "sefa", "taha", "furkan", "berkay", "kaan", "arda", "batuhan",
    "berke", "eren", "emir", "yigit", "alp", "bartu", "ege",
    "ozan", "ozkan", "ozcan", "ozgur", "ugur", "ugurcan", "zeynel",
    "ramazan", "erhan", "veysi", "emrah", "yasin", "ferdi", "bilal",
    "diyar", "sezer", "oktay", "baran", "savas", "mahsum", "cemil",
    "selcuk", "mesut", "yunus", "hayrettin", "harun", "ilyas", "ferhat",
    "hakki", "veysel", "olcay", "poyraz", "hamza", "kutlu", "necati",
    "ercan", "serafettin", "dino", "telman",
    "metin", "firat", "alparslan", "oguz", "turgut", "erdem", "cenk",
    "doruk", "utku", "berk", "ata", "mert", "tugrul", "polat", "ilker",
    "ilhan", "adem", "bahadir", "caner", "oguzhan", "bulent", "nihat",
    "teoman", "hikmet", "ridvan", "nevzat", "galip", "ferit", "celal",
    "sabri", "nuri", "arif", "sadik", "mazhar", "faruk", "cahit",
    "irfan", "sukru", "tahir", "munir", "remzi", "necip", "hayri",
    "nazim", "ruhi", "mithat", "rasim", "salih", "talat", "zeki",
    "adnan", "akif", "asim", "atilla", "avni", "bedri", "besim",
    # --- Turkish female names (~80) ---
    "zeynep", "ayse", "fatma", "emine", "hatice", "merve", "busra",
    "esra", "kubra", "selin", "gamze", "irem", "tugba", "gizem",
    "derya", "sevgi", "gulsen", "yasemin", "pinar", "songul",
    "nurgul", "ebru", "elif", "defne", "ecrin", "azra", "nehir",
    "asya", "beril", "ceren", "dilan", "damla", "eda", "eylul",
    "feray", "fulya", "gonca", "guliz", "hande", "hilal", "idil",
    "ipek", "jale", "kevser", "kezban", "lale", "leman", "melek",
    "meryem", "mine", "nalan", "nazan", "nesrin", "nihal", "nur",
    "nuray", "ozlem", "pembe", "perihan", "reyhan", "ruya", "sanem",
    "seher", "sevil", "sibel", "simge", "sinem", "suzan", "sule",
    "tuba", "tulin", "ulku", "vildan", "yeliz", "yildiz", "zuhal",
    "berna", "birsen", "cansu", "cigdem", "dilek", "filiz", "gulsah",
    # --- Arabic names (~100) ---
    "muhammad", "muhammet", "muhammed", "mohammed", "ahmed", "omar",
    "hassan", "hussein", "abdul", "abdulkadir", "abdulrahman", "abdulaziz",
    "abdallah", "abdullah", "khalid", "tariq", "arafat", "farhan", "imran",
    "yasser", "nasser", "samir", "karim", "rahim", "rashid", "faisal",
    "sultan", "walid", "ziad", "bilal", "jamal", "salim", "adel",
    "nabil", "rami", "sami", "tamer", "wael", "zaki", "anwar",
    "badr", "daud", "dawud", "elias", "habib", "hakim", "hamid",
    "haris", "idris", "issa", "jalal", "karam", "latif", "majid",
    "mansour", "marwan", "mazin", "murad", "nadir", "qasim", "rafiq",
    "saad", "sabir", "shadi", "shakir", "sharif", "tahir", "tarek",
    "usama", "wasim", "yahya", "zain", "zayd",
    # Arabic female names
    "fatima", "aisha", "khadija", "maryam", "amina", "layla", "hana",
    "nour", "rania", "samira", "yasmin", "zahra", "dina", "lina",
    "malak", "mona", "nadia", "noura", "reem", "salma", "sara",
    "suha", "sumaya", "wafa", "zeinab", "aya", "dalal", "huda",
    "iman", "jamila", "lamia", "lubna", "maysa", "nahla", "rabab",
    "rasha", "rawda", "sawsan", "siham", "suhair", "tahani",
    # --- South Asian names ---
    "raj", "sanjay", "vijay", "amit", "rahul", "suresh",
    "deepak", "arjun", "ravi", "krishna", "naveen", "anil", "pradeep",
    # --- Hispanic names ---
    "carlos", "miguel", "luis", "jorge", "pedro", "ricardo", "rafael",
    "fernando", "alejandro", "diego", "sergio", "pablo", "andres", "antonio",
    "francisco", "manuel", "eduardo", "oscar", "mario", "hector", "ivan",
    # --- East Asian names ---
    "wei", "chen", "ming", "hong", "jin", "jing", "yong", "ling", "xiao",
    "zhang", "wang", "liu", "yang",
    # --- Miscellaneous ---
    "rohullah", "majd", "zokirzhon", "ana", "delil",
}

# Build a sorted list for fuzzy matching (only names with 3+ chars)
_NAMES_LIST = sorted(n for n in COMMON_FIRST_NAMES if len(n) >= 3)


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
    # Turkish stopwords that could false-match greetings
    "bey", "hanim", "efendi", "hocam",
}


def _validate_name(name: str) -> bool:
    """Validate that a string looks like a real name.

    - At least 2 characters
    - Starts with an uppercase letter (including accented)
    - No digits anywhere
    """
    if len(name) < 2:
        return False
    if not re.match(r"^[A-Z\u00C0-\u024F]", name):
        return False
    if re.search(r"\d", name):
        return False
    return True


def _fuzzy_match_name(candidate: str) -> str | None:
    """Use difflib to find a close match in the names dictionary.

    Returns the matched name (capitalized) or None.
    """
    if len(candidate) < 3:
        return None
    matches = difflib.get_close_matches(candidate.lower(), _NAMES_LIST, n=1, cutoff=0.8)
    if matches:
        return matches[0]
    return None


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
            if not _validate_name(name):
                continue
            # Check for compound name (peek ahead in text)
            compound = _try_compound_name(text, match)
            if compound:
                return compound
            return name
    return None


def _try_compound_name(text: str, match: re.Match) -> str | None:
    """Check if the greeting match is the start of a compound first name."""
    end_pos = match.end(1)
    # Look for a second capitalized word right after
    next_word_match = re.match(r"\s+([A-Z\u00C0-\u024F][a-z\u00E0-\u024F]{1,20})", text[end_pos:])
    if not next_word_match:
        return None
    first_part = match.group(1)
    second_part = next_word_match.group(1)
    compound_key = f"{first_part.lower()} {second_part.lower()}"
    if compound_key in _COMPOUND_FIRST_NAMES:
        return f"{first_part} {second_part}"
    return None


def _clean_name_part(s: str) -> str:
    """Strip trailing digits and repeated trailing chars from a name part."""
    # Strip trailing digits
    s = re.sub(r"\d+$", "", s).strip()
    # Strip trailing repeated char (e.g. "turelii" -> "tureli")
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
    -> ("Muhammet", "Bayram")
    """
    lower_local = local_part.lower().replace(".", "").replace("_", "").replace("-", "")
    lower_local_clean = re.sub(r"\d+$", "", lower_local)
    # For compound first names, strip spaces for matching
    lower_first = first_name.lower().replace(" ", "")

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


def _try_compound_from_local(clean: str) -> tuple[str, str] | None:
    """Check if the email local part starts with a known compound name."""
    for compound in _COMPOUND_FIRST_NAMES:
        # compound names stored with space; for local part matching, remove space
        compound_no_space = compound.replace(" ", "")
        if len(compound_no_space) < 4:
            continue
        if clean.startswith(compound_no_space):
            remainder = clean[len(compound_no_space):]
            remainder = _strip_boundary_dupes(remainder, compound_no_space[-1])
            # Capitalize each word in compound name
            first = " ".join(w.capitalize() for w in compound.split())
            last = _clean_name_part(remainder).capitalize() if remainder else ""
            return first, last
    return None


def extract_from_dictionary(local_part: str) -> tuple[str, str] | None:
    """Tier 3: Match longest known first name prefix from dictionary.

    Also tries fuzzy matching and compound name detection.
    """
    clean = local_part.lower().replace(".", "").replace("_", "").replace("-", "")
    # Strip trailing digits
    clean = re.sub(r"\d+$", "", clean)
    if not clean:
        return None

    # Try compound names first (they're longer, more specific)
    compound_result = _try_compound_from_local(clean)
    if compound_result:
        return compound_result

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

    # If no exact match, try fuzzy matching on plausible prefixes
    if not best_name:
        # Try progressively shorter prefixes for fuzzy match
        for prefix_len in range(min(len(clean), 15), 2, -1):
            candidate = clean[:prefix_len]
            fuzzy_result = _fuzzy_match_name(candidate)
            if fuzzy_result:
                best_name = fuzzy_result
                best_end = prefix_len
                break

    if not best_name:
        return None

    remainder = clean[best_end:]
    remainder = _strip_boundary_dupes(remainder, best_name[-1])

    first = best_name.capitalize()
    last = _clean_name_part(remainder).capitalize() if remainder else ""

    # Validate the extracted name
    if not _validate_name(first):
        return None

    return first, last


async def extract_names_for_account(db, smtp_client: SmtpDevClient, account: dict) -> dict | None:
    """Main orchestrator: apply Tier 1 -> 2 -> 3 name extraction for a single account.

    Returns {"first_name": ..., "last_name": ...} or None if no extraction possible.
    Wrapped in a 5-second timeout to prevent hangs.
    """
    try:
        return await asyncio.wait_for(
            _extract_names_impl(db, smtp_client, account),
            timeout=5.0,
        )
    except asyncio.TimeoutError:
        email = account.get("email", "")
        logger.warning(f"Name extraction timed out for {mask_email(email)}")
        return None


async def _extract_names_impl(db, smtp_client: SmtpDevClient, account: dict) -> dict | None:
    """Internal implementation of name extraction (called within timeout wrapper)."""
    email = account.get("email", "")
    local_part = email.split("@")[0] if "@" in email else ""
    smtp_account_id = account.get("smtp_account_id")

    if not smtp_account_id or not local_part:
        return None

    # --- Tier 1: Greeting extraction from recent emails (max 5 messages, rate limited) ---
    first_name = None
    try:
        smtp_data = await smtp_client.find_account_by_email(email)
        if smtp_data:
            inbox_id = smtp_data.get("inbox_id")
            if inbox_id:
                result = await smtp_client.get_messages(smtp_account_id, inbox_id, page=1, per_page=5)
                messages = result.get("data", [])
                for msg in messages[:5]:
                    # Try to get full message body
                    msg_path = msg.get("@id") or msg.get("id")
                    if not msg_path:
                        continue
                    await asyncio.sleep(0.2)  # Rate limit SMTP.dev API calls
                    full_msg = await smtp_client.get_message(str(msg_path))
                    if not full_msg:
                        continue
                    body = full_msg.get("text", "") or full_msg.get("html", "")
                    name = extract_name_from_greeting(body)
                    if name:
                        first_name = name
                        logger.info(f"Tier 1 match for {mask_email(email)}: greeting -> {first_name}")
                        break
    except Exception as e:
        logger.warning(f"Tier 1 failed for {mask_email(email)}: {e}")

    # --- Tier 2: Split local part using extracted first name ---
    if first_name:
        first, last = split_email_local_part(local_part, first_name)
        if _validate_name(first):
            return {"first_name": first, "last_name": last}
        return {"first_name": first, "last_name": ""}

    # --- Tier 3: Dictionary fallback (with fuzzy matching) ---
    dict_result = extract_from_dictionary(local_part)
    if dict_result:
        first, last = dict_result
        logger.info(f"Tier 3 match for {mask_email(email)}: dictionary -> {first} {last}")
        return {"first_name": first, "last_name": last}

    logger.debug(f"No name extraction possible for {mask_email(email)}")
    return None
