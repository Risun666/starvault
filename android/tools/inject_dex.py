#!/usr/bin/env python3
"""Add classes.dex to the resource-only APK produced by aapt2 link.

Usage: inject_dex.py <base.apk> <classes.dex> <out.apk>
"""
import shutil
import sys
import zipfile

base, dex, out = sys.argv[1:4]
shutil.copyfile(base, out)
with zipfile.ZipFile(out, 'a', zipfile.ZIP_DEFLATED) as z:
    z.write(dex, 'classes.dex')
with zipfile.ZipFile(out) as z:
    names = z.namelist()
    assert 'classes.dex' in names, 'classes.dex was not added'
    assets = [n for n in names if n.startswith('assets/www/')]
    assert 'AndroidManifest.xml' in names and 'resources.arsc' in names
    # NOTE: do not call z.testzip() here. aapt2 emits zip entries with alignment
    # padding / data descriptors that CPython's zipfile misreads as a CRC
    # mismatch. zipalign + apksigner perform the authoritative verification.
print('  assets: %d files, classes.dex added' % len(assets))
