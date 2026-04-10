
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=4)

def run_async(func, *args):
    executor.submit(func, *args)
