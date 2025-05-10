cd "/Users/guy-ben-yosef/Library/CloudStorage/GoogleDrive-gbenjos@gmail.com/Other computers/Pluto/Guy/Projects/medic-cases-analyzer"
source "venv/bin/activate"
open http://127.0.0.1:5001
python app.py 2>&1 | tee logs/app_$(date +%Y%m%d_%H%M%S).log