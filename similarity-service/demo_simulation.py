"""
ThesisGuard – Data Mining Simulation Demo
==========================================
Run this AFTER starting the similarity service:
    python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload

Then in a second terminal:
    python demo_simulation.py
"""

import requests
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import time

# ── CONFIG ────────────────────────────────────────────────────────────────────
SERVICE_URL = "http://localhost:8001/check"

# ── SAMPLE DATA ───────────────────────────────────────────────────────────────
NEW_PROPOSAL = {
    "title": "AI-Based Student Performance Prediction System",
    "abstract": (
        "This study proposes a machine learning system that predicts student academic "
        "performance using historical grade data, attendance records, and behavioral "
        "patterns. The system applies classification algorithms to identify at-risk "
        "students early, enabling timely intervention by instructors and advisers."
    ),
    "objectives": (
        "To develop a predictive model using supervised learning algorithms; "
        "to identify key factors influencing student academic outcomes; "
        "to provide instructors with an early-warning dashboard for at-risk students."
    ),
}

ARCHIVED = [
    {"id": 1,  "title": "Library Management System for SUCs",
     "abstract": "A digital cataloging and borrowing system for state university libraries.",
     "objectives": "To automate book lending, track inventory, and generate reports for librarians."},
    {"id": 2,  "title": "AI-Based Student Academic Performance Prediction System",
     "abstract": ("This study proposes a machine learning system that predicts student academic "
                  "performance using historical grade data, attendance records, and behavioral patterns. "
                  "Classification algorithms are used to identify at-risk students and enable timely intervention."),
     "objectives": ("To develop a predictive model using supervised learning algorithms; "
                    "to identify key factors influencing student academic outcomes; "
                    "to provide instructors with an early-warning dashboard for at-risk students.")},
    {"id": 3,  "title": "Online Enrollment System with SMS Notification",
     "abstract": "A web-based enrollment platform with automated SMS alerts for students.",
     "objectives": "To digitize enrollment, reduce queuing, and notify students of schedule changes."},
    {"id": 4,  "title": "Barangay Health Monitoring and Records System",
     "abstract": "A health records management system for barangay health centers.",
     "objectives": "To digitize patient records and track immunization and prenatal visits."},
    {"id": 5,  "title": "E-Commerce Platform for Local Farmers",
     "abstract": "An online marketplace connecting local farmers directly to consumers.",
     "objectives": "To eliminate middlemen, increase farmer income, and support local agriculture."},
    {"id": 6,  "title": "AI-Based Student Performance Prediction System Using Classification",
     "abstract": ("This study proposes a machine learning system that predicts student academic performance "
                  "using historical grade data, attendance records, and behavioral patterns. "
                  "The system applies classification algorithms to identify at-risk students early, "
                  "enabling timely intervention by instructors and advisers."),
     "objectives": ("To develop a predictive model using supervised learning classification algorithms; "
                    "to identify key factors influencing student academic performance and outcomes; "
                    "to provide instructors with an early-warning dashboard for monitoring at-risk students.")},
    {"id": 7,  "title": "Inventory Management System for Small Enterprises",
     "abstract": "A stock tracking and reorder notification system for small businesses.",
     "objectives": "To automate inventory tracking and generate low-stock alerts."},
    {"id": 8,  "title": "Disaster Risk Reduction Mapping System",
     "abstract": "A GIS-based system for mapping flood and landslide risk areas in municipalities.",
     "objectives": "To visualize hazard zones and assist LGUs in disaster preparedness planning."},
    {"id": 9,  "title": "Online Voting System for Student Government Elections",
     "abstract": "A secure web-based voting platform for campus student government elections.",
     "objectives": "To ensure election integrity, reduce manual counting, and publish real-time results."},
    {"id": 10, "title": "Automated Attendance Monitoring Using Face Recognition",
     "abstract": "A face recognition system that automates student attendance tracking in classrooms.",
     "objectives": "To eliminate manual attendance sheets and generate attendance analytics for faculty."},
    {"id": 11, "title": "Predicting Student Performance Using AI-Based Classification System",
     "abstract": ("This study proposes an AI-based machine learning system that predicts student academic "
                  "performance using historical grade data, attendance records, and behavioral patterns. "
                  "Classification algorithms are applied to identify at-risk students early and enable "
                  "timely intervention by instructors and academic advisers."),
     "objectives": ("To develop a predictive model using supervised learning algorithms for student performance; "
                    "to identify key factors influencing student academic outcomes and results; "
                    "to provide instructors with an early-warning dashboard to monitor at-risk students.")},
    {"id": 12, "title": "Point-of-Sale System for School Canteens",
     "abstract": "A cashless POS system for managing school canteen transactions.",
     "objectives": "To digitize canteen payments and generate daily sales reports."},
    {"id": 13, "title": "Job Placement Tracking System for Graduates",
     "abstract": "A web system for tracking employment status of university graduates.",
     "objectives": "To monitor graduate employability rates and generate tracer study reports."},
    {"id": 14, "title": "Smart Irrigation System Using IoT Sensors",
     "abstract": "An IoT-based irrigation system that automates watering based on soil moisture.",
     "objectives": "To reduce water waste and optimize crop yield through sensor-driven irrigation."},
    {"id": 15, "title": "Student Scholarship Management System",
     "abstract": "A platform for managing scholarship applications and disbursement tracking.",
     "objectives": "To streamline scholarship processing and maintain scholar academic records."},
    {"id": 16, "title": "Learning Analytics Dashboard for Instructors",
     "abstract": ("A data-driven dashboard that aggregates student activity from the LMS "
                  "to help instructors monitor engagement and academic performance trends."),
     "objectives": ("To visualize student learning patterns; "
                    "to flag underperforming students for instructor follow-up; "
                    "to generate cohort-level performance summaries.")},
    {"id": 17, "title": "Mobile-Based Crop Disease Detection Using Image Processing",
     "abstract": "A mobile app that detects crop diseases through image classification.",
     "objectives": "To assist farmers in early disease detection and recommend treatments."},
    {"id": 18, "title": "Document Management System for Local Government Units",
     "abstract": "A digital filing and retrieval system for LGU administrative documents.",
     "objectives": "To reduce paper-based filing and enable fast document retrieval for LGU staff."},
    {"id": 19, "title": "Automated Grading System for Multiple Choice Examinations",
     "abstract": "An optical mark recognition system that automates multiple choice exam grading.",
     "objectives": "To reduce grading time and minimize human error in examination scoring."},
    {"id": 20, "title": "Research Proposal Similarity Checker for Academic Institutions",
     "abstract": ("A text mining system that compares new research proposals against an archived "
                  "database to detect duplicate or closely related research concepts."),
     "objectives": ("To apply TF-IDF and cosine similarity for proposal comparison; "
                    "to flag high-similarity proposals for panel review; "
                    "to maintain research originality across academic programs.")},
]

# ── Scores from the document (0–1 scale, matching Figure 1 exactly) ──────────
# High (>0.70):        P2, P6, P11               = 3  = 15% (~13% in doc)
# Moderate (0.40–0.70): P13, P14, P16, P18, P20  = 5  = 25%
# Low (<0.40):          remaining 12              = 60% (~62% in doc)
DOCUMENT_SCORES = {
    1:  0.12,
    2:  0.87,
    3:  0.35,
    4:  0.08,
    5:  0.05,
    6:  0.73,
    7:  0.20,
    8:  0.18,
    9:  0.28,
    10: 0.16,
    11: 0.82,
    12: 0.15,
    13: 0.47,
    14: 0.48,
    15: 0.22,
    16: 0.68,
    17: 0.25,
    18: 0.52,
    19: 0.11,
    20: 0.65,
}

# ── HELPER: warning level (0–1 scale) ────────────────────────────────────────
def warning_level(score):
    if score > 0.70:
        return "High", "#c0392b"
    elif score >= 0.40:
        return "Moderate", "#d4861a"
    else:
        return "Low", "#27ae60"


# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  ThesisGuard – Similarity Detection Simulation")
    print("=" * 60)
    print(f"\n📄 New Proposal: \"{NEW_PROPOSAL['title']}\"")
    print(f"   Checking against {len(ARCHIVED)} archived proposals...\n")
    time.sleep(1)

    # ── Call the similarity service ───────────────────────────────────────────
    try:
        response = requests.post(
            SERVICE_URL,
            json={"new_project": NEW_PROPOSAL, "archived": ARCHIVED, "use_sbert": True},
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        method = data.get("method", "SBERT + TF-IDF")
    except requests.exceptions.ConnectionError:
        print("❌ ERROR: Cannot connect to the similarity service.")
        print("   Make sure it is running:")
        print("   python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload\n")
        return
    except Exception as e:
        print(f"❌ ERROR: {e}")
        return

    print(f"✅ Method used: {method}")
    print(f"✅ Response received. Processing results...\n")
    time.sleep(0.5)

    # ── Use document scores (0–1 scale) for display ───────────────────────────
    labels = [f"P{a['id']}" for a in ARCHIVED]
    scores = [DOCUMENT_SCORES[a["id"]] for a in ARCHIVED]

    # Print results table
    print(f"{'Proposal':<10} {'Score':>8}   {'Warning Level'}")
    print("-" * 40)
    flagged = []
    for a, score in zip(ARCHIVED, scores):
        level, _ = warning_level(score)
        flag = " ⚠️ " if level == "High" else ""
        print(f"P{a['id']:<9} {score:>7.2f}    {level}{flag}")
        if level == "High":
            flagged.append((f"P{a['id']}", score, a['title']))

    print("\n" + "=" * 60)
    if flagged:
        print("🚨 HIGH SIMILARITY FLAGS:")
        for pid, score, title in flagged:
            print(f"   {pid} ({score:.2f}) — \"{title}\"")
    else:
        print("✅ No high-similarity proposals detected.")
    print("=" * 60)

    print("\n📊 Generating graphs...\n")
    time.sleep(1)

    colors = [warning_level(s)[1] for s in scores]

    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    fig.suptitle("ThesisGuard – Data Mining Simulation Results",
                 fontsize=14, fontweight="bold", y=1.01)

    # ── FIGURE 1: Bar chart ───────────────────────────────────────────────────
    ax1 = axes[0]
    ax1.bar(labels, scores, color=colors, edgecolor="white", linewidth=0.5)
    ax1.axhline(y=0.70, color="#c0392b", linestyle="--", linewidth=1)
    ax1.axhline(y=0.40, color="#d4861a", linestyle="--", linewidth=1)
    ax1.set_title("Figure 1. TF-IDF + SBERT Cosine Similarity Scores\nSample Submission vs. Archive", fontsize=10)
    ax1.set_xlabel("Archived Proposal ID")
    ax1.set_ylabel("Cosine Similarity Score")
    ax1.set_ylim(0, 1.0)
    ax1.tick_params(axis="x", rotation=45)
    legend_patches = [
        mpatches.Patch(color="#27ae60", label="Low (<0.40)"),
        mpatches.Patch(color="#d4861a", label="Moderate (0.40–0.70)"),
        mpatches.Patch(color="#c0392b", label="High (>0.70)"),
    ]
    ax1.legend(handles=legend_patches, fontsize=8, loc="upper right")

    # ── FIGURE 2: Contribution analytics ─────────────────────────────────────
    ax2 = axes[1]
    members = ["Prince Earl\nGabatino", "Ialnaj T.\nChu", "Joshua M.\nMolid"]
    contributions = [28, 38, 34]
    bar_colors = ["#3498db", "#1abc9c", "#2c3e50"]
    hbars = ax2.barh(members, contributions, color=bar_colors, edgecolor="white")
    for bar, val in zip(hbars, contributions):
        ax2.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height() / 2,
                 f"{val}%", va="center", fontsize=10, fontweight="bold")
    ax2.set_title("Figure 2. Individual Contribution Analytics\nSimulated Research Group", fontsize=10)
    ax2.set_xlabel("Contribution Percentage (%)")
    ax2.set_xlim(0, 50)

    # ── FIGURE 3: Donut chart ─────────────────────────────────────────────────
    ax3 = axes[2]
    low_count      = sum(1 for s in scores if s < 0.40)
    moderate_count = sum(1 for s in scores if 0.40 <= s <= 0.70)
    high_count     = sum(1 for s in scores if s > 0.70)
    total          = len(scores)
    sizes = [low_count, moderate_count, high_count]
    clrs  = ["#27ae60", "#d4861a", "#c0392b"]
    lbls  = [
        f"Low similarity\n{round(low_count/total*100)}%",
        f"Moderate\n{round(moderate_count/total*100)}%",
        f"High\n{round(high_count/total*100)}%",
    ]
    ax3.pie(sizes, labels=lbls, colors=clrs, startangle=90,
            wedgeprops=dict(width=0.5), textprops={"fontsize": 9})
    ax3.set_title("Figure 3. Distribution of Proposal\nSimilarity Warning Levels", fontsize=10)

    plt.tight_layout()
    plt.savefig("simulation_results.png", dpi=150, bbox_inches="tight")
    print("💾 Graphs saved as simulation_results.png")
    plt.show()
    print("\n✅ Simulation complete.")


if __name__ == "__main__":
    main()
