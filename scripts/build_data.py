"""Génère data/routes.json à partir du GTFS national SNCF."""
import io, json, math, os, re, unicodedata, zipfile
from datetime import datetime, timezone
import pandas as pd
import requests

GTFS_URL="https://eu.ftp.opendatasoft.com/sncf/plandata/Export_OpenData_SNCF_GTFS_NewTripId.zip"
OUT_PATH=os.path.join(os.path.dirname(__file__),"..","data","routes.json")
ROUTES=[
{"id":"paris-austerlitz-vierzon","name":"Paris Austerlitz → Vierzon","origin":"Paris Austerlitz","destination":"Vierzon"},
{"id":"paris-lyon-part-dieu","name":"Paris (Gare de Lyon) → Lyon Part-Dieu","origin":"Paris Gare de Lyon","destination":"Lyon Part Dieu"},
{"id":"paris-montparnasse-bordeaux","name":"Paris (Montparnasse) → Bordeaux St-Jean","origin":"Paris Montparnasse","destination":"Bordeaux St Jean"},
{"id":"paris-lyon-marseille","name":"Paris (Gare de Lyon) → Marseille St-Charles","origin":"Paris Gare de Lyon","destination":"Marseille St Charles"},]
DAYS=["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]

def normalize(text):
 text=unicodedata.normalize("NFKD",str(text)).encode("ascii","ignore").decode(); return re.sub(r"[^a-z0-9]+"," ",text.lower()).strip()

def bearing(lat1,lon1,lat2,lon2):
 a,b=math.radians(lat1),math.radians(lat2); d=math.radians(lon2-lon1)
 x=math.sin(d)*math.cos(b); y=math.cos(a)*math.sin(b)-math.sin(a)*math.cos(b)*math.cos(d)
 return (math.degrees(math.atan2(x,y))+360)%360

def build_segments(points):
 out=[]
 for a,b in zip(points,points[1:]):
  lat1,lon1=float(a["shape_pt_lat"]),float(a["shape_pt_lon"]); lat2,lon2=float(b["shape_pt_lat"]),float(b["shape_pt_lon"])
  if lat1==lat2 and lon1==lon2: continue
  out.append({"start":{"lat":lat1,"lon":lon1},"end":{"lat":lat2,"lon":lon2},"midpoint":{"lat":(lat1+lat2)/2,"lon":(lon1+lon2)/2},"bearing":bearing(lat1,lon1,lat2,lon2)})
 return out

def find_stop_ids(stops,name):
 target=normalize(name); names=stops["stop_name"].apply(normalize); mask=names.apply(lambda n: target in n or n in target)
 ids=set(stops.loc[mask,"stop_id"].astype(str)); print(f"  {name}: {len(ids)} stop_id(s)"); return ids

def to_minutes(v):
 h,m,s=map(int,v.split(":")); return h*60+m+s/60

def download_gtfs():
 print("Téléchargement du GTFS SNCF…"); r=requests.get(GTFS_URL,timeout=120); r.raise_for_status(); print(f"  {len(r.content)/1e6:.1f} Mo"); return zipfile.ZipFile(io.BytesIO(r.content))

def read_shape(zf,shape_id):
 if not shape_id or "shapes.txt" not in zf.namelist(): return []
 matches=[]
 with zf.open("shapes.txt") as f:
  for chunk in pd.read_csv(f,dtype=str,chunksize=500_000):
   hit=chunk[chunk["shape_id"].astype(str)==str(shape_id)]
   if not hit.empty: matches.append(hit)
 if not matches: return []
 shape=pd.concat(matches,ignore_index=True); shape["shape_pt_sequence"]=shape["shape_pt_sequence"].astype(int); shape=shape.sort_values("shape_pt_sequence")
 return shape[["shape_pt_lat","shape_pt_lon","shape_pt_sequence"]].to_dict("records")

def read_trip_stop_points(zf,stops,trip_id,origin_ids,destination_ids):
 """Fallback: construit une polyligne à partir de tous les arrêts du train."""
 rows=[]
 with zf.open("stop_times.txt") as f:
  for chunk in pd.read_csv(f,dtype=str,usecols=["trip_id","stop_id","stop_sequence"],chunksize=500_000):
   hit=chunk[chunk["trip_id"]==trip_id]
   if not hit.empty: rows.append(hit)
 if not rows: return []
 times=pd.concat(rows,ignore_index=True); times["stop_sequence"]=times["stop_sequence"].astype(int); times=times.sort_values("stop_sequence")
 origins=times[times["stop_id"].isin(origin_ids)]; dests=times[times["stop_id"].isin(destination_ids)]
 if origins.empty or dests.empty: return []
 start=int(origins.iloc[0]["stop_sequence"]); end=int(dests.iloc[-1]["stop_sequence"]); times=times[(times["stop_sequence"]>=start)&(times["stop_sequence"]<=end)]
 coords=stops[["stop_id","stop_lat","stop_lon"]].dropna().drop_duplicates("stop_id")
 joined=times.merge(coords,on="stop_id",how="left").dropna(subset=["stop_lat","stop_lon"])
 return [{"shape_pt_lat":r.stop_lat,"shape_pt_lon":r.stop_lon,"shape_pt_sequence":int(r.stop_sequence)} for r in joined.itertuples()]

def main():
 zf=download_gtfs()
 with zf.open("stops.txt") as f: stops=pd.read_csv(f,dtype=str)
 with zf.open("trips.txt") as f: trips=pd.read_csv(f,dtype=str)
 if "calendar.txt" in zf.namelist():
  with zf.open("calendar.txt") as f: calendar=pd.read_csv(f,dtype=str)
 else:
  print("  calendar.txt absent : les jours seront laissés non filtrés"); calendar=pd.DataFrame()
 stop_ids={}; all_ids=set()
 for route in ROUTES:
  o=find_stop_ids(stops,route["origin"]); d=find_stop_ids(stops,route["destination"]); stop_ids[route["id"]]=(o,d); all_ids|=o|d
 print("Lecture de stop_times.txt…"); pieces=[]; keep=["trip_id","stop_id","stop_sequence","arrival_time","departure_time"]
 with zf.open("stop_times.txt") as f:
  for chunk in pd.read_csv(f,dtype=str,usecols=keep,chunksize=500_000):
   hit=chunk[chunk["stop_id"].isin(all_ids)]
   if not hit.empty: pieces.append(hit)
 if not pieces: raise RuntimeError("Aucun horaire correspondant aux gares suivies n'a été trouvé.")
 hits=pd.concat(pieces,ignore_index=True); hits["stop_sequence"]=hits["stop_sequence"].astype(int); grouped=hits.groupby("trip_id"); output=[]
 for route in ROUTES:
  origin_ids,destination_ids=stop_ids[route["id"]]; matching=[]
  for trip_id,g in grouped:
   origins=g[g["stop_id"].isin(origin_ids)]; dests=g[g["stop_id"].isin(destination_ids)]
   if origins.empty or dests.empty: continue
   o=origins.sort_values("stop_sequence").iloc[0]; d=dests.sort_values("stop_sequence").iloc[-1]
   if int(d["stop_sequence"])>int(o["stop_sequence"]): matching.append((trip_id,o["departure_time"],d["arrival_time"]))
  print(f"  {route['name']}: {len(matching)} circulation(s)")
  if not matching: continue
  trip_ids=[x[0] for x in matching]; meta=trips[trips["trip_id"].isin(trip_ids)].set_index("trip_id"); trips_out=[]; shape_id=None; representative_trip=None
  for trip_id,dep,arr in matching:
   if trip_id not in meta.index: continue
   row=meta.loc[trip_id]; days=[]
   if not calendar.empty and "service_id" in calendar.columns:
    service=calendar[calendar["service_id"]==row.get("service_id")]
    if not service.empty:
     sr=service.iloc[0]; days=[day for day in DAYS if sr.get(day)=="1"]
   trips_out.append({"trip_id":trip_id,"departure_time":dep,"arrival_time":arr,"duration_min":round(to_minutes(arr)-to_minutes(dep)),"days":days})
   if representative_trip is None: representative_trip=trip_id
   if shape_id is None and "shape_id" in meta.columns and pd.notna(row.get("shape_id")): shape_id=str(row.get("shape_id"))
  points=read_shape(zf,shape_id)
  geometry_source="shapes.txt"
  if not points and representative_trip:
   print(f"    Aucun shape exploitable : fallback sur les arrêts du trip {representative_trip}")
   points=read_trip_stop_points(zf,stops,representative_trip,origin_ids,destination_ids); geometry_source="stop_times+stops"
  print(f"    Tracé: {len(points)} point(s) via {geometry_source}")
  coords=[[float(p["shape_pt_lat"]),float(p["shape_pt_lon"])] for p in points]
  output.append({"id":route["id"],"name":route["name"],"shape":coords,"segments":build_segments(points),"geometry_source":geometry_source,"trips":sorted(trips_out,key=lambda t:t["departure_time"])})
 os.makedirs(os.path.dirname(OUT_PATH),exist_ok=True)
 with open(OUT_PATH,"w",encoding="utf-8") as f: json.dump({"generated_at":datetime.now(timezone.utc).isoformat(),"source":"SNCF Open Data — Licence Ouverte Etalab 2.0","routes":output},f,ensure_ascii=False,indent=2)
 print(f"Écrit : {OUT_PATH}")

if __name__=="__main__": main()
