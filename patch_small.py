import re

with open('src/app.js', 'rb') as f:
    content = f.read()

old = b"'<span>'+esc(m.name)+'<small>'+(position?'Schemavecka '+position:isHome?'Timvikarie':'G\x8fstande ers\x8fttare')+'</small></span>'"
new = b"'<span>'+esc(m.name)+'</span>'"

if old in content:
    content = content.replace(old, new)
    with open('src/app.js', 'wb') as f:
        f.write(content)
    print("Done.")
else:
    # Try to find the span part to see what bytes are there
    idx = content.find(b"'<span>'+esc(m.name)+'<small>'")
    if idx >= 0:
        print("Found partial at", idx, ":", content[idx:idx+120])
    else:
        idx = content.find(b'Schemavecka')
        if idx >= 0:
            print("Found Schemavecka at", idx, ":", content[idx-40:idx+80])
        else:
            print("Schemavecka NOT found at all")
