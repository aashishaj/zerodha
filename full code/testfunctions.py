import time
from datetime import datetime, date

# dt = datetime.fromtimestamp(time.time())
# print(dt)

# dt1 = datetime.now()
# print(dt1)

# dt2 = time.time()
# print(dt2)

# dt3 = date.today()
# print(dt3)

def convert_dict_to_tokens():
    watchlist = {
        58929927: "SILVERMIC22FEBFUT",
        60098567: "GOLDM22MARFUT",
        58843911: "SILVERM22APRFUT",
    }
    tokens = list(watchlist.keys())
    print(tokens)
