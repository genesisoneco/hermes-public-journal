"""Authoring source for manifest.json (row rects, facings, modes, refH and
animation table). Edit here, then: python make_manifest.py && python build.py.
manifest.json may also be edited by hand; this script overwrites it."""
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
import json
S={"1":"../../../tmp/Trinity/ChatGPT Image Sep 19, 2026, 12_49_26 PM (1).png"}
for i in range(2,6): S[str(i)]=f"../../../tmp/Trinity/ChatGPT Image Sep 19, 2026, 12_49_27 PM ({i}).png"
rows=[]
def R(id,sheet,x0,y0,x1,y1,n,facing,mode="solid",**kw):
    if isinstance(facing,str): facing=[facing]*n if len(facing)==1 else list(facing)
    d={"id":id,"sheet":sheet,"rect":[x0,y0,x1-x0,y1-y0],"frames":n,"facing":facing,"mode":mode}
    d.update(kw); rows.append(d)
# sheet 1 movement
R("idle_front",1,12,116,480,254,4,"F")
R("idle_side",1,493,116,950,254,4,"R")
R("idle_back",1,966,116,1442,254,4,"B")
R("walk_right",1,14,316,480,447,5,"R")
R("walk_left",1,493,316,947,447,5,"L")
R("walk_back",1,966,316,1436,447,5,"B")
R("walk_front",1,16,510,476,642,5,"F")
R("run_right",1,493,510,947,642,5,"R")
R("run_left",1,966,510,1422,642,5,"L")
R("run_back",1,14,703,480,850,5,"B")
R("run_front",1,493,703,952,850,5,"F")
R("jump",1,966,703,1442,850,5,"R",anchorY="row")
R("fall",1,14,912,470,1044,5,"R",anchorY="row")
R("land",1,493,912,952,1044,5,"R")
R("turn",1,966,912,1438,1044,5,["F","R","B","L","F"])
# sheet 2 combat
R("dash",2,22,126,722,254,5,"R","glow")
R("hover",2,758,98,1432,254,6,"F","glow",anchorY="row",labelRect=[[752,66,302,44]])
R("fly",2,18,286,640,422,5,"R","glow",anchorY="row",labelRect=[[8,254,196,42]])
R("spin",2,672,286,1442,424,5,"F","glow",labelRect=[[660,254,222,42]])
R("beam",2,22,468,778,580,4,"R","glow",cuts=[162,312,500])
R("projectile",2,788,468,1436,580,6,"R","glow")
R("shield",2,8,608,452,752,3,"F","glow",labelRect=[[6,582,152,40],[6,746,262,10]])
R("hurt",2,486,612,935,742,4,"F")
R("knockdown",2,972,636,1442,742,4,"F")
R("recover",2,28,776,568,892,4,"F",labelRect=[[6,750,262,42]])
R("die",2,655,766,1422,892,5,"F","glow",anchorY="row",labelRect=[[634,750,206,42]])
R("special",2,18,918,692,1070,5,"F","glow",labelRect=[[6,900,270,44]])
R("teleport_in",2,700,944,1102,1070,4,"F","glow",anchorY="row")
R("teleport_out",2,1122,944,1436,1070,3,"F","glow",anchorY="row")
# sheet 3 emotes (F,F,S,B,S)
R("sit",3,36,114,692,245,5,"FFLBR")
R("happy",3,746,114,1412,245,5,"FFFBR")
R("sad",3,36,294,697,422,5,"FFLBR")
R("angry",3,746,294,1417,422,5,"FFFBR")
R("surprised",3,36,474,692,602,5,"FFLBR")
R("listen",3,746,474,1417,602,5,"FFLBR")
R("confused",3,36,652,692,780,5,"FFLBR")
R("sleep",3,742,652,1407,780,5,"FLBBR")
R("wake_up",3,33,828,692,950,5,"FFFBR")
R("love",3,742,828,1422,950,5,"FFFBR")
R("dance",3,6,992,370,1080,5,"FFFBR")
R("ear_wiggle",3,390,992,714,1080,4,"FFBF")
R("headphone_adjust",3,733,992,1074,1080,4,"FFBF")
R("wave",3,1086,992,1442,1080,4,"FFBR")
# sheet 4 interaction
R("scan",4,13,126,747,252,6,"F")
R("hack",4,795,126,1442,252,5,"F")
R("pick_up",4,16,298,672,440,5,"FRRRR",labelRect=[[14,262,168,46]])
R("carry",4,738,298,1442,440,6,"R",labelRect=[[736,262,162,46]])
R("push",4,33,488,717,614,4,"R",labelRect=[[14,446,146,46]])
R("pull",4,736,488,1442,614,4,"L",cuts=[872,1090,1300])
R("climb",4,23,638,717,802,6,"R",labelRect=[[14,618,154,44]])
R("slip",4,746,660,1442,802,5,"R",labelRect=[[736,618,138,46]])
R("low_battery",4,18,836,707,960,6,"F",labelRect=[[14,808,226,44]])
R("charging",4,743,836,1427,960,5,"F",labelRect=[[734,808,188,46]])
R("repair",4,13,985,702,1084,6,"F",labelRect=[[12,956,232,46]])
R("victory",4,736,985,1442,1084,6,"F",labelRect=[[732,956,176,46]])
# sheet 5 fx / ui / objects / portraits  (single items)
def one(id,x0,y0,x1,y1,mode="glow",anchor="center",scaleRef=0.8): R(id,5,x0,y0,x1,y1,1,"F",mode,anchor=anchor,scaleRef=scaleRef)
for id,x0,x1,y0,y1 in [("fx_sparkle",40,118,172,268),("fx_sparkle_small",150,200,190,245),("fx_star",230,294,180,258),
  ("fx_heart",308,390,180,256),("fx_heart_small",404,458,198,248),("fx_hearts",488,584,160,262),
  ("fx_exclaim",598,654,164,264),("fx_exclaim_yellow",668,724,164,264),("fx_question",754,822,168,262),
  ("fx_ring_blue",34,174,292,392),("fx_ring_heart",178,308,288,392),("fx_burst_pink",326,440,286,406),
  ("fx_burst_orange",466,562,280,400),("fx_comet",580,764,300,390),("fx_star_blue",776,904,278,410),
  ("fx_portal_floor_pink",32,178,420,524),("fx_portal_floor_blue",186,342,420,524),("fx_portal_pink",364,446,410,550),
  ("fx_portal_blue",478,554,416,548),("fx_smoke",576,692,440,534),("fx_smoke_small",692,790,452,532),("fx_dust",790,912,436,532)]:
    one(id,x0,y0,x1,y1)
for id,x0,x1,y0,y1 in [("ui_bunny",952,1034,164,256),("ui_heart",1056,1136,180,252),("ui_star",1160,1238,178,254),
  ("ui_exclaim",1268,1316,164,262),("ui_question",1344,1414,164,262),
  ("ui_battery_1",956,1040,276,336),("ui_battery_2",1056,1140,276,336),("ui_battery_3",1158,1248,276,336),("ui_battery_4",1286,1408,272,338),
  ("ui_shield_pink",950,1028,352,436),("ui_shield_blue",1048,1126,352,436),("ui_gear_pink",1140,1222,352,436),
  ("ui_gear_purple",1238,1312,356,432),("ui_plus",1330,1410,352,434),
  ("ui_speaker_on",950,1030,452,532),("ui_speaker_off",1046,1124,452,532),("ui_mail",1144,1224,456,528),
  ("ui_gear",1236,1312,452,532),("ui_trophy",1326,1414,452,538)]:
    one(id,x0,y0,x1,y1,"solid","center",0.6)
for id,x0,x1,y0,y1 in [("obj_box",650,800,628,744),("obj_laptop",822,996,622,736),("obj_trophy",1028,1146,616,742),
  ("obj_carrot",620,720,738,876),("obj_crate",754,922,740,876),("obj_battery",956,1040,742,874),("obj_blocks",1086,1192,734,880)]:
    one(id,x0,y0,x1,y1,"solid","feet",0.45)
R("portraits",5,18,898,1432,1037,10,"F","solid",anchor="center",scaleRef=0.75)
man={"version":1,"sheets":{k:{"path":v,"layout":"freeform"} for k,v in S.items()},
     "target":{"idleRow":"idle_front","bodyH1x":120},
     "rows":rows}
s=json.dumps(man,indent=1)
open("manifest.json","w").write(s)
print(len(rows))

# ---- per-row reference body height (px in the source sheet that should read as idle-front height)
REFH={"walk_right":116,"walk_left":116,"walk_back":113,"walk_front":111,"run_right":110,"run_left":112,"run_back":114,
"run_front":108,"jump":106,"fall":104,"land":104,"turn":108,
"dash":98,"hover":103,"fly":103,"spin":100,"beam":95,"projectile":99,"shield":97,"hurt":97,"knockdown":97,"recover":103,
"die":97,"special":99,"teleport_in":100,"teleport_out":100,
"wake_up":118,"love":115,"dance":76,"ear_wiggle":78,"headphone_adjust":77,"wave":77,
"scan":116,"hack":119,"pick_up":117,"carry":119,"push":109,"pull":107,"climb":110,"slip":112,"low_battery":93,"charging":93,
"repair":82,"victory":85}
for r in rows:
    if r["sheet"]<5: r["refH"]=REFH.get(r["id"],121)
man["target"]["idleRefH"]=121

# ---- animations: src row, frame indices (repeats allowed), fps, loop, flip, ev, facing, blend
A={}
def an(key,src,f,fps,loop=True,flip=False,ev=None,facing=None,blend="normal",pp=False):
    if pp: f=list(f)+list(f[-2:0:-1])
    A[key]={"src":src,"f":list(f),"fps":fps,"loop":loop,"flip":flip,"facing":facing,"blend":blend}
    if ev: A[key]["ev"]=ev
STEP={"1":"step","3":"step"}
an("idle_F","idle_front",[0,3,0,3,2,3],4,facing="F")
an("idle_B","idle_back",[0,1],3,facing="B")
an("idle_R","idle_side",[0,1,2,3],4,facing="R")
an("idle_L","idle_side",[0,3],3,flip=True,facing="L")      # side idle faces R; frames 0/3 show no badge
an("walk_F","walk_front",range(5),9,ev=STEP,facing="F")
an("walk_B","walk_back",range(5),9,ev=STEP,facing="B")
an("walk_R","walk_right",range(5),9,ev=STEP,facing="R")
an("walk_L","walk_left",range(5),9,ev=STEP,facing="L")
an("run_F","run_front",range(5),12,ev=STEP,facing="F")
an("run_B","run_back",range(5),12,ev=STEP,facing="B")
an("run_R","run_right",range(5),12,ev=STEP,facing="R")
an("run_L","run_left",range(5),12,ev=STEP,facing="L")
an("jump","jump",range(5),10,loop=False,facing="R")
an("fall","fall",range(5),8,facing="R")
an("land","land",range(5),10,loop=False,facing="R",ev={"1":"land"})
an("turn","turn",range(5),8,loop=False,facing="F")
an("dash","dash",[0,2,4],12,facing="R")
an("hover","hover",[3,4,5,4],8,facing="F")
an("fly","fly",range(5),8,facing="R")
an("spin","spin",[0,1,2,3],12,facing="F")
an("beam","beam",range(4),8,loop=False,facing="R")
an("projectile","projectile",[0,1,5],8,loop=False,facing="R")
an("shield","shield",[0,1,2],6,facing="F")
an("hurt","hurt",range(4),8,loop=False,facing="F")
an("knockdown","knockdown",range(4),8,loop=False,facing="F",ev={"3":"thud"})
an("recover","recover",range(4),6,loop=False,facing="F")
an("die","die",range(5),6,loop=False,facing="F")
an("special","special",range(5),8,loop=False,facing="F")
an("teleport_in","teleport_in",range(4),10,loop=False,facing="F")
an("teleport_out","teleport_out",range(3),10,loop=False,facing="F")
an("sit","sit",[0,1],3,facing="F")
an("happy","happy",[0,1,2],6,pp=True,facing="F")
an("sad","sad",[0,1],3,facing="F")
an("angry","angry",[0,1,2],6,pp=True,facing="F")
an("surprised","surprised",[0,1],6,loop=False,facing="F")
an("listen","listen",[0,0,0,1],4,facing="F")
an("confused","confused",[0,1],3,facing="F")
an("sleep","sleep",[0],1,facing="F")
an("wake_up","wake_up",[0,1,2],5,loop=False,facing="F")
an("love","love",[0,1,2],6,pp=True,facing="F")
an("dance","dance",range(5),8,facing="F")
an("ear_wiggle","ear_wiggle",[0,1,3,1],8,facing="F")
an("headphone_adjust","headphone_adjust",[0,1,3],6,loop=False,facing="F")
an("wave","wave",[0,1],5,facing="F")
an("scan","scan",range(6),6,facing="F")
an("hack","hack",range(5),6,facing="F")
an("pick_up","pick_up",range(5),8,loop=False,facing="R")
an("carry","carry",[1,2,3,4],8,facing="R",ev=STEP)
an("push","push",range(4),6,facing="R")
an("pull","pull",[0,1,2],6,facing="R")
an("climb","climb",range(6),6,loop=False,facing="R")
an("slip","slip",range(5),8,loop=False,facing="R")
an("low_battery","low_battery",[0,2,4,5],4,loop=False,facing="F")
an("charging","charging",[2,3,4],3,facing="F")
an("repair","repair",[0,1,3,4,5],6,facing="F")
an("victory","victory",[1,2,3,5],8,facing="F")
for r in rows:
    if r["sheet"]==5 and r["id"]!="portraits":
        an(r["id"],r["id"],[0],1,loop=False)
for i,p in enumerate(["neutral","happy","wink","laugh","blush","surprised","angry","sad","sleep","love"]):
    an("portrait_"+p,"portraits",[i],1,loop=False,facing="F")
man["anims"]=A
open("manifest.json","w").write(json.dumps(man,indent=1))
print("anims",len(A))
