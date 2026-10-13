import sys,re,json,base64,struct
from PIL import Image
src=open(sys.argv[1],encoding='utf-8').read()
emb=re.search(r'EMBLEM = "([^"]+)"',src).group(1)
items=json.loads(src[src.index('LOOT: readonly LootItem[] = ')+len('LOOT: readonly LootItem[] = '):])
off=int(sys.argv[2]) if len(sys.argv)>2 else 0
arts=[('emblem',emb)]+[(i['name'],i['art']) for i in items[off:off+11]]
S=8; D=(30,30,30); sheet=Image.new('RGB',(24*S*4,24*S*3),D)
col=lambda v: D if v==0x01000000 else ((v>>16)&255,(v>>8)&255,v&255)
for k,(n,a) in enumerate(arts):
    b=base64.b64decode(a); w=struct.unpack(f'<{len(b)//4}I',b)
    for c in range(24*12):
        ch,fg,bg=w[c*3:c*3+3]; x=c%24; y=c//24
        top,bot={0x2580:(col(fg),col(bg)),0x2584:(col(bg),col(fg))}.get(ch,(D,D))
        ox=(k%4)*24*S; oy=(k//4)*24*S
        for dy in range(S):
            for dx in range(S):
                sheet.putpixel((ox+x*S+dx,oy+y*2*S+dy),top); sheet.putpixel((ox+x*S+dx,oy+(y*2+1)*S+dy),bot)
sheet.save('preview.png')
