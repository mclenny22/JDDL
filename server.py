#!/usr/bin/env python3
"""Run the integrated AD4K site or its local placeholder preview."""
import argparse

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', action='store_true', help='Serve the frontend with placeholder content')
    if parser.parse_args().preview:
        from backend.preview import run
    else:
        from backend.server import run
    run()
